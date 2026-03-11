import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId

import connexion

from swagger_server.db import get_db
from swagger_server import twilio_provider

logger = logging.getLogger(__name__)


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
    message_template = data.get('message_template', '')
    variables = data.get('variables') or {}

    if not all([client_id, target, channel, message_template]):
        return {'error': {'message': 'client_id, target, channel and message_template are required', 'type': 'validation_error', 'code': 400}}, 400

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
        'message_template': message_template,
        'variables': variables,
        'status': 'pending',
        'created_at': now,
    }
    result = db.notifications.insert_one(doc)
    notification_id = str(result.inserted_id)

    # Attempt delivery
    try:
        delivery = twilio_provider.send_notification(target, message, channel, db)
        status = 'sent' if delivery.get('success') else 'failed'
        update_data = {'status': status, 'sent_at': datetime.now(tz=timezone.utc)}
        if delivery.get('message_sid'):
            update_data['message_sid'] = delivery['message_sid']
    except Exception as exc:
        logger.error("Delivery failed for notification %s: %s", notification_id, exc)
        status = 'failed'
        update_data = {'status': 'failed', 'error': str(exc)}

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
