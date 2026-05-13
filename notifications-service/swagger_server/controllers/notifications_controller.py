import logging
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

import connexion

from swagger_server.db import get_db
from swagger_server import twilio_provider

logger = logging.getLogger(__name__)

STATUS_PENDING = 'PENDING'
STATUS_DELIVERED = 'DELIVERED'
STATUS_FAILED = 'FAILED'
STATUS_ABORTED_BY_PREFERENCE = 'ABORTED_BY_PREFERENCE'
STATUS_QUEUED_FOR_DIGEST = 'QUEUED_FOR_DIGEST'
PREFERENCES_HINT_PREFIX = 'Se pretende deixar de receber notificações ou alterar as suas preferências clique no link abaixo:'
DEFAULT_PREFERENCES_LINK_BASE_URL = 'http://localhost:3000/preferences'


def _normalize_status(value: str) -> str:
    normalized = (value or '').strip().upper()
    known = {
        STATUS_PENDING,
        STATUS_DELIVERED,
        STATUS_FAILED,
        STATUS_ABORTED_BY_PREFERENCE,
        STATUS_QUEUED_FOR_DIGEST,
        'PROCESSING',
        'SENT',
    }
    return normalized if normalized in known else normalized


def _message_from_template(message_template: str, variables: dict) -> str:
    return message_template.format(**variables) if variables else message_template


def _build_preferences_link(secret: str) -> str:
    if not secret:
        return ''

    base_url = (os.environ.get('PREFERENCES_LINK_BASE_URL') or DEFAULT_PREFERENCES_LINK_BASE_URL).strip()
    if not base_url:
        return ''

    parsed = urlsplit(base_url)
    query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_params['secret'] = secret
    query = urlencode(query_params)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, query, parsed.fragment))


def _is_first_notification_for_target(db, target: str) -> bool:
    existing = db.notifications.find_one(
        {
            'target': target,
            'status': {'$ne': STATUS_ABORTED_BY_PREFERENCE},
        },
        projection={'_id': 1},
    )
    return existing is None


def _append_preferences_hint(message: str, preference: dict, is_first_for_target: bool) -> str:
    if not is_first_for_target or not preference:
        return message

    secret = str(preference.get('secret') or '').strip()
    if not secret:
        return message

    link = _build_preferences_link(secret)
    if not link:
        return message

    return f'{message}\n\n{PREFERENCES_HINT_PREFIX} {link}'


def _payload_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def _extract_idempotency_key() -> str:
    headers = connexion.request.headers or {}
    key = headers.get('Idempotency-Key') or headers.get('X-Idempotency-Key')
    if not key:
        return ''
    return str(key).strip()


def _audit_event(db, event_type: str, notification_id=None, status=None, details=None):
    correlation_id = (connexion.request.headers or {}).get('X-Correlation-ID')
    doc = {
        'event_type': event_type,
        'notification_id': str(notification_id) if notification_id else None,
        'status': _normalize_status(status) if status else None,
        'correlation_id': correlation_id,
        'details': details or {},
        'created_at': datetime.now(tz=timezone.utc),
    }
    try:
        db.notification_audit.insert_one(doc)
    except Exception as exc:
        logger.warning('Failed to write notification audit event %s: %s', event_type, exc)


def _normalize_alert_type(value: str) -> str:
    normalized = (value or '').strip().lower()
    if normalized in ('warning', 'warnings'):
        return 'warnings'
    if normalized == 'critical':
        return 'critical'
    return normalized


def _channel_kind(channel: str) -> str:
    lowered = (channel or '').lower()
    if 'email' in lowered:
        return 'email'
    if 'whatsapp' in lowered or 'sms' in lowered:
        return 'sms'
    return 'sms'


def _find_user_preference(db, target: str):
    return db.user_preferences.find_one(
        {
            '$or': [
                {'targets.sms': target},
                {'targets.email': target},
            ]
        }
    )


def _doc_to_dict(doc: dict) -> dict:
    """Convert a MongoDB document to a JSON-serialisable dict."""
    result = dict(doc)
    if '_id' in result:
        result['id'] = str(result.pop('_id'))
    result.pop('payload_hash', None)
    if isinstance(result.get('updated_at'), datetime):
        result['updated_at'] = result['updated_at'].isoformat()
    if isinstance(result.get('sent_at'), datetime):
        result['sent_at'] = result['sent_at'].isoformat()
    if isinstance(result.get('created_at'), datetime):
        result['created_at'] = result['created_at'].isoformat()
    if isinstance(result.get('status'), str):
        result['status'] = _normalize_status(result['status'])
    return result


def v1_notifications_get(client_id, limit=25, offset=0):  # noqa: E501
    """GET /v1/notifications — list notifications for a client."""
    db = get_db()
    cursor = (
        db.notifications
        .find({'client_id': client_id})
        .sort('created_at', -1)
        .skip(offset)
        .limit(limit)
    )
    items = [_doc_to_dict(doc) for doc in cursor]
    return items, 200


def v1_notifications_delete(client_id):  # noqa: E501
    """DELETE /v1/notifications — wipe every notification + digest queue entry
    for a client. Demo/admin operation; used to reset state between runs."""
    db = get_db()
    notif_result = db.notifications.delete_many({'client_id': client_id})
    digest_result = db.digest_queue.delete_many({'client_id': client_id})
    audit_result = db.notification_audit.delete_many({'client_id': client_id})
    return {
        'notifications_deleted': notif_result.deleted_count,
        'digest_deleted': digest_result.deleted_count,
        'audit_deleted': audit_result.deleted_count,
    }, 200


def v1_notifications_post(body):  # noqa: E501
    """POST /v1/notifications — send a new notification."""
    db = get_db()

    if connexion.request.is_json:
        data = connexion.request.get_json()
    else:
        data = body if isinstance(body, dict) else (body.to_dict() if hasattr(body, 'to_dict') else {})

    client_id = data.get('client_id')
    target = data.get('target')
    channel = data.get('channel')
    alert_type = _normalize_alert_type(data.get('alert_type'))
    message_template = data.get('message_template', '')
    variables = data.get('variables') or {}
    idempotency_key = _extract_idempotency_key()

    if idempotency_key and len(idempotency_key) > 128:
        return {'error': {'message': 'Idempotency-Key must be <= 128 chars', 'type': 'validation_error', 'code': 400}}, 400

    if not all([client_id, target, channel, alert_type, message_template]):
        return {'error': {'message': 'client_id, target, channel, alert_type and message_template are required', 'type': 'validation_error', 'code': 400}}, 400
    if alert_type not in ('critical', 'warnings'):
        return {'error': {'message': "alert_type must be 'critical' or 'warning'", 'type': 'validation_error', 'code': 400}}, 400

    # Render the message
    try:
        message = _message_from_template(message_template, variables)
    except KeyError as exc:
        return {'error': {'message': f'Missing template variable: {exc}', 'type': 'validation_error', 'code': 400}}, 400

    payload_signature = {
        'client_id': client_id,
        'target': target,
        'channel': channel,
        'alert_type': alert_type,
        'message_template': message_template,
        'variables': variables,
    }
    payload_hash = _payload_hash(payload_signature)

    if idempotency_key:
        existing = db.notifications.find_one({'client_id': client_id, 'idempotency_key': idempotency_key})
        if existing:
            if existing.get('payload_hash') != payload_hash:
                return {'error': {'message': 'Idempotency-Key was already used with a different payload', 'type': 'conflict_error', 'code': 409}}, 409
            _audit_event(
                db,
                'IDEMPOTENCY_REPLAY',
                notification_id=existing.get('_id'),
                status=existing.get('status'),
                details={'client_id': client_id, 'idempotency_key': idempotency_key},
            )
            existing_payload = _doc_to_dict(existing)
            existing_payload['idempotent_replay'] = True
            return existing_payload, 200

    is_first_for_target = _is_first_notification_for_target(db, target)

    now = datetime.now(tz=timezone.utc)
    doc = {
        'client_id': client_id,
        'target': target,
        'channel': channel,
        'alert_type': alert_type,
        'message_template': message_template,
        'variables': variables,
        'status': STATUS_PENDING,
        'payload_hash': payload_hash,
        'created_at': now,
    }
    if idempotency_key:
        doc['idempotency_key'] = idempotency_key

    try:
        result = db.notifications.insert_one(doc)
    except DuplicateKeyError:
        existing = db.notifications.find_one({'client_id': client_id, 'idempotency_key': idempotency_key})
        if existing:
            if existing.get('payload_hash') != payload_hash:
                return {'error': {'message': 'Idempotency-Key was already used with a different payload', 'type': 'conflict_error', 'code': 409}}, 409
            existing_payload = _doc_to_dict(existing)
            existing_payload['idempotent_replay'] = True
            return existing_payload, 200
        return {'error': {'message': 'Could not persist notification', 'type': 'storage_error', 'code': 500}}, 500

    notification_id = str(result.inserted_id)

    _audit_event(
        db,
        'CREATED',
        notification_id=result.inserted_id,
        status=STATUS_PENDING,
        details={'client_id': client_id, 'target': target, 'channel': channel, 'alert_type': alert_type},
    )

    preference = _find_user_preference(db, target)
    message = _append_preferences_hint(message, preference, is_first_for_target)
    channel_type = _channel_kind(channel)
    if preference:
        channel_enabled = bool(preference.get('channels', {}).get(channel_type, True))
        delivery_mode = (preference.get('alert_type', {}).get(alert_type) or 'immediate').lower()
    else:
        channel_enabled = True
        delivery_mode = 'immediate'

    if not channel_enabled:
        db.notifications.update_one(
            {'_id': result.inserted_id},
            {'$set': {'status': STATUS_ABORTED_BY_PREFERENCE, 'updated_at': datetime.now(tz=timezone.utc)}}
        )
        _audit_event(
            db,
            'ABORTED_BY_PREFERENCE',
            notification_id=result.inserted_id,
            status=STATUS_ABORTED_BY_PREFERENCE,
            details={'channel_type': channel_type},
        )
        return {
            'id': notification_id,
            'client_id': client_id,
            'status': STATUS_ABORTED_BY_PREFERENCE,
            'created_at': now.isoformat(),
        }, 201

    if delivery_mode == 'digest':
        db.digest_queue.insert_one(
            {
                'notification_id': result.inserted_id,
                'client_id': client_id,
                'target': target,
                'channel': channel,
                'alert_type': alert_type,
                'message': message,
                'status': STATUS_QUEUED_FOR_DIGEST,
                'queued_at': datetime.now(tz=timezone.utc),
            }
        )
        db.notifications.update_one(
            {'_id': result.inserted_id},
            {'$set': {'status': STATUS_QUEUED_FOR_DIGEST, 'updated_at': datetime.now(tz=timezone.utc)}}
        )
        _audit_event(
            db,
            'ENQUEUED_FOR_DIGEST',
            notification_id=result.inserted_id,
            status=STATUS_QUEUED_FOR_DIGEST,
            details={'delivery_mode': 'digest'},
        )
        return {
            'id': notification_id,
            'client_id': client_id,
            'status': STATUS_QUEUED_FOR_DIGEST,
            'created_at': now.isoformat(),
        }, 201

    # Attempt delivery
    try:
        delivery = twilio_provider.send_notification(target, message, channel, db)
        status = STATUS_DELIVERED if delivery.get('success') else STATUS_FAILED
        update_data = {'status': status, 'sent_at': datetime.now(tz=timezone.utc)}
        if delivery.get('message_sid'):
            update_data['message_sid'] = delivery['message_sid']
        _audit_event(
            db,
            'DELIVERY_ATTEMPT',
            notification_id=result.inserted_id,
            status=status,
            details={'provider_success': bool(delivery.get('success'))},
        )
    except Exception as exc:
        logger.error("Delivery failed for notification %s: %s", notification_id, exc)
        status = STATUS_FAILED
        update_data = {'status': STATUS_FAILED, 'error': str(exc), 'updated_at': datetime.now(tz=timezone.utc)}
        _audit_event(
            db,
            'DELIVERY_ATTEMPT',
            notification_id=result.inserted_id,
            status=STATUS_FAILED,
            details={'provider_success': False, 'error': str(exc)},
        )

    db.notifications.update_one({'_id': result.inserted_id}, {'$set': update_data})

    response = {
        'id': notification_id,
        'client_id': client_id,
        'status': _normalize_status(status),
        'created_at': now.isoformat(),
    }
    return response, 201


def v1_notifications_id_get(id):  # noqa: E501
    """GET /v1/notifications/{id} — fetch a single notification."""
    db = get_db()
    try:
        oid = ObjectId(id)
    except (InvalidId, TypeError):
        return {'error': {'message': 'Invalid notification ID', 'type': 'not_found', 'code': 404}}, 404

    doc = db.notifications.find_one({'_id': oid})
    if doc is None:
        return {'error': {'message': f'Notification {id} not found', 'type': 'not_found', 'code': 404}}, 404

    return _doc_to_dict(doc), 200


def v1_digest_process_post(body=None):  # noqa: E501
    """POST /v1/digest/process — manual trigger to process queued digest messages."""
    db = get_db()

    if connexion.request.is_json:
        data = connexion.request.get_json() or {}
    else:
        data = body if isinstance(body, dict) else (body.to_dict() if hasattr(body, 'to_dict') else {})

    batch_size = data.get('batch_size', 50)
    dry_run = bool(data.get('dry_run', False))

    try:
        batch_size = int(batch_size)
    except (TypeError, ValueError):
        return {'error': {'message': 'batch_size must be an integer', 'type': 'validation_error', 'code': 400}}, 400

    if batch_size < 1 or batch_size > 500:
        return {'error': {'message': 'batch_size must be between 1 and 500', 'type': 'validation_error', 'code': 400}}, 400

    cursor = (
        db.digest_queue
        .find({'status': 'QUEUED_FOR_DIGEST'})
        .sort('queued_at', 1)
        .limit(batch_size)
    )
    entries = list(cursor)

    if dry_run:
        preview = []
        for entry in entries:
            preview.append(
                {
                    'id': str(entry.get('_id')),
                    'target': entry.get('target'),
                    'channel': entry.get('channel'),
                    'alert_type': entry.get('alert_type'),
                    'queued_at': entry.get('queued_at').isoformat() if isinstance(entry.get('queued_at'), datetime) else None,
                }
            )
        return {
            'status': 'dry_run',
            'batch_size': batch_size,
            'queued_found': len(entries),
            'preview': preview,
        }, 200

    sent_count = 0
    failed_count = 0
    skipped_count = 0

    for entry in entries:
        queue_id = entry.get('_id')
        notification_id = entry.get('notification_id')

        locked = db.digest_queue.update_one(
            {'_id': queue_id, 'status': 'QUEUED_FOR_DIGEST'},
            {'$set': {'status': 'PROCESSING', 'processing_started_at': datetime.now(tz=timezone.utc)}},
        )
        if locked.modified_count == 0:
            skipped_count += 1
            continue

        try:
            delivery = twilio_provider.send_notification(
                entry.get('target', ''),
                entry.get('message', ''),
                entry.get('channel', ''),
                db,
            )
            sent_at = datetime.now(tz=timezone.utc)

            queue_update = {
                'status': 'SENT',
                'sent_at': sent_at,
                'updated_at': sent_at,
            }
            if delivery.get('message_sid'):
                queue_update['message_sid'] = delivery['message_sid']

            db.digest_queue.update_one({'_id': queue_id}, {'$set': queue_update})

            notification_update = {
                'status': STATUS_DELIVERED,
                'sent_at': sent_at,
                'updated_at': sent_at,
            }
            if delivery.get('message_sid'):
                notification_update['message_sid'] = delivery['message_sid']

            if notification_id:
                db.notifications.update_one({'_id': notification_id}, {'$set': notification_update})
                _audit_event(
                    db,
                    'DIGEST_DELIVERED',
                    notification_id=notification_id,
                    status=STATUS_DELIVERED,
                    details={'queue_id': str(queue_id)},
                )

            sent_count += 1
        except Exception as exc:
            failed_at = datetime.now(tz=timezone.utc)
            db.digest_queue.update_one(
                {'_id': queue_id},
                {'$set': {'status': STATUS_FAILED, 'error': str(exc), 'updated_at': failed_at}},
            )
            if notification_id:
                db.notifications.update_one(
                    {'_id': notification_id},
                    {'$set': {'status': STATUS_FAILED, 'error': str(exc), 'updated_at': failed_at}},
                )
                _audit_event(
                    db,
                    'DIGEST_FAILED',
                    notification_id=notification_id,
                    status=STATUS_FAILED,
                    details={'queue_id': str(queue_id), 'error': str(exc)},
                )
            failed_count += 1

    return {
        'status': 'processed',
        'batch_size': batch_size,
        'queued_found': len(entries),
        'sent': sent_count,
        'failed': failed_count,
        'skipped': skipped_count,
    }, 200
