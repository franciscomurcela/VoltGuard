import logging
from datetime import datetime, timezone

import connexion

from swagger_server.db import get_db

logger = logging.getLogger(__name__)


def v1_channels_post(body):  # noqa: E501
    """POST /v1/channels — register or update a notification channel."""
    db = get_db()

    if connexion.request.is_json:
        data = connexion.request.get_json()
    else:
        data = body if isinstance(body, dict) else (body.to_dict() if hasattr(body, 'to_dict') else {})

    name = data.get('name')
    provider = data.get('provider')
    api_key = data.get('api_key')

    if not all([name, provider, api_key]):
        return {'error': {'message': 'name, provider and api_key are required', 'type': 'validation_error', 'code': 400}}, 400

    now = datetime.now(tz=timezone.utc)
    channel_doc = {
        'name': name,
        'provider': provider,
        'api_key': api_key,
        'updated_at': now,
    }
    db.channels.update_one({'name': name}, {'$set': channel_doc, '$setOnInsert': {'created_at': now}}, upsert=True)
    logger.info("Channel '%s' registered/updated", name)

    return {'name': name, 'provider': provider, 'status': 'registered'}, 201
