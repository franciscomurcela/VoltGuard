import logging
from datetime import datetime, timezone

from swagger_server.db import get_db

logger = logging.getLogger(__name__)


def v1_opt_out_post(secret):  # noqa: E501
    """POST /v1/opt-out — opt a target out of notifications."""
    if not secret:
        return {'error': {'message': 'secret is required', 'type': 'validation_error', 'code': 400}}, 400

    db = get_db()
    db.opt_outs.update_one(
        {'secret': secret},
        {'$set': {'secret': secret, 'opted_out_at': datetime.now(tz=timezone.utc)}},
        upsert=True,
    )
    logger.info("Opt-out recorded for secret hash")
    return {'status': 'opted_out'}, 200


def health_get():  # noqa: E501
    """GET /health — liveness probe."""
    return {'status': 'healthy', 'service': 'notifications-service'}, 200
