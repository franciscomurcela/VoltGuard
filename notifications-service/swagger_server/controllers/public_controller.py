import logging
from datetime import datetime, timezone

import connexion

from swagger_server.db import get_db

logger = logging.getLogger(__name__)


def _sanitize_preferences(doc: dict) -> dict:
    return {
        'user_id': doc.get('user_id'),
        'channels': doc.get('channels', {}),
        'alert_type': doc.get('alert_type', {}),
    }


def v1_preferences_get(secret):  # noqa: E501
    """GET /v1/preferences — fetch a user's current preferences by secret."""
    if not secret:
        return {'error': {'message': 'secret is required', 'type': 'validation_error', 'code': 400}}, 400

    db = get_db()
    doc = db.user_preferences.find_one({'secret': secret})
    if not doc:
        return {'error': {'message': 'Preferences not found for provided secret', 'type': 'not_found', 'code': 404}}, 404
    return _sanitize_preferences(doc), 200


def v1_preferences_patch(secret, body=None):  # noqa: E501
    """PATCH /v1/preferences — update selected preference fields."""
    if not secret:
        return {'error': {'message': 'secret is required', 'type': 'validation_error', 'code': 400}}, 400

    db = get_db()
    existing = db.user_preferences.find_one({'secret': secret})
    if not existing:
        return {'error': {'message': 'Preferences not found for provided secret', 'type': 'not_found', 'code': 404}}, 404

    if connexion.request.is_json:
        payload = connexion.request.get_json() or {}
    else:
        payload = body if isinstance(body, dict) else (body.to_dict() if hasattr(body, 'to_dict') else {})

    update_set = {'updated_at': datetime.now(tz=timezone.utc)}

    channels = payload.get('channels')
    if channels is not None:
        if not isinstance(channels, dict):
            return {'error': {'message': 'channels must be an object', 'type': 'validation_error', 'code': 400}}, 400
        for key, value in channels.items():
            if key not in ('sms', 'email'):
                return {'error': {'message': f"unsupported channel '{key}'", 'type': 'validation_error', 'code': 400}}, 400
            if not isinstance(value, bool):
                return {'error': {'message': f"channels.{key} must be boolean", 'type': 'validation_error', 'code': 400}}, 400
            update_set[f'channels.{key}'] = value

    alert_type = payload.get('alert_type')
    if alert_type is not None:
        if not isinstance(alert_type, dict):
            return {'error': {'message': 'alert_type must be an object', 'type': 'validation_error', 'code': 400}}, 400
        for key, value in alert_type.items():
            if key not in ('critical', 'warnings'):
                return {'error': {'message': f"unsupported alert_type '{key}'", 'type': 'validation_error', 'code': 400}}, 400
            if value not in ('immediate', 'digest'):
                return {'error': {'message': f"alert_type.{key} must be 'immediate' or 'digest'", 'type': 'validation_error', 'code': 400}}, 400
            update_set[f'alert_type.{key}'] = value

    if len(update_set) == 1:
        return {'error': {'message': 'No valid preference fields provided', 'type': 'validation_error', 'code': 400}}, 400

    db.user_preferences.update_one({'secret': secret}, {'$set': update_set})
    updated = db.user_preferences.find_one({'secret': secret})
    return _sanitize_preferences(updated), 200


def health_get():  # noqa: E501
    """GET /health — liveness probe."""
    return {'status': 'healthy', 'service': 'notifications-service'}, 200
