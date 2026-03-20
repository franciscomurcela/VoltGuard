import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId

import connexion

from swagger_server.db import get_db
from swagger_server import twilio_provider

logger = logging.getLogger(__name__)


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
    if isinstance(result.get('created_at'), datetime):
        result['created_at'] = result['created_at'].isoformat()
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

    if not all([client_id, target, channel, alert_type, message_template]):
        return {'error': {'message': 'client_id, target, channel, alert_type and message_template are required', 'type': 'validation_error', 'code': 400}}, 400
    if alert_type not in ('critical', 'warnings'):
        return {'error': {'message': "alert_type must be 'critical' or 'warning'", 'type': 'validation_error', 'code': 400}}, 400

    # Render the message
    try:
        message = message_template.format(**variables) if variables else message_template
    except KeyError as exc:
        return {'error': {'message': f'Missing template variable: {exc}', 'type': 'validation_error', 'code': 400}}, 400

    now = datetime.now(tz=timezone.utc)
    doc = {
        'client_id': client_id,
        'target': target,
        'channel': channel,
        'alert_type': alert_type,
        'message_template': message_template,
        'variables': variables,
        'status': 'PENDING',
        'created_at': now,
    }
    result = db.notifications.insert_one(doc)
    notification_id = str(result.inserted_id)

    preference = _find_user_preference(db, target)
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
            {'$set': {'status': 'ABORTED_BY_PREFERENCE', 'updated_at': datetime.now(tz=timezone.utc)}}
        )
        return {
            'id': notification_id,
            'client_id': client_id,
            'status': 'ABORTED_BY_PREFERENCE',
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
                'status': 'QUEUED_FOR_DIGEST',
                'queued_at': datetime.now(tz=timezone.utc),
            }
        )
        db.notifications.update_one(
            {'_id': result.inserted_id},
            {'$set': {'status': 'QUEUED_FOR_DIGEST', 'updated_at': datetime.now(tz=timezone.utc)}}
        )
        return {
            'id': notification_id,
            'client_id': client_id,
            'status': 'QUEUED_FOR_DIGEST',
            'created_at': now.isoformat(),
        }, 201

    # Attempt delivery
    try:
        delivery = twilio_provider.send_notification(target, message, channel, db)
        status = 'DELIVERED' if delivery.get('success') else 'FAILED'
        update_data = {'status': status, 'sent_at': datetime.now(tz=timezone.utc)}
        if delivery.get('message_sid'):
            update_data['message_sid'] = delivery['message_sid']
    except Exception as exc:
        logger.error("Delivery failed for notification %s: %s", notification_id, exc)
        status = 'FAILED'
        update_data = {'status': 'FAILED', 'error': str(exc)}

    db.notifications.update_one({'_id': result.inserted_id}, {'$set': update_data})

    response = {
        'id': notification_id,
        'client_id': client_id,
        'status': status,
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
                'status': 'DELIVERED',
                'sent_at': sent_at,
                'updated_at': sent_at,
            }
            if delivery.get('message_sid'):
                notification_update['message_sid'] = delivery['message_sid']

            if notification_id:
                db.notifications.update_one({'_id': notification_id}, {'$set': notification_update})

            sent_count += 1
        except Exception as exc:
            failed_at = datetime.now(tz=timezone.utc)
            db.digest_queue.update_one(
                {'_id': queue_id},
                {'$set': {'status': 'FAILED', 'error': str(exc), 'updated_at': failed_at}},
            )
            if notification_id:
                db.notifications.update_one(
                    {'_id': notification_id},
                    {'$set': {'status': 'FAILED', 'error': str(exc), 'updated_at': failed_at}},
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
