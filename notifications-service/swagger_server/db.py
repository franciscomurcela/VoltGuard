import logging
import os

from pymongo import MongoClient, ASCENDING, DESCENDING

from swagger_server.seed import seed_default_preferences

logger = logging.getLogger(__name__)

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        url = os.environ.get('MONGODB_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('MONGODB_DATABASE', 'notifications_db')
        _client = MongoClient(url)
        _db = _client[db_name]
        _db.notifications.create_index(
            [('client_id', ASCENDING), ('created_at', DESCENDING)]
        )
        _db.user_preferences.create_index([('secret', ASCENDING)], unique=True)
        _db.user_preferences.create_index([('targets.sms', ASCENDING)])
        _db.user_preferences.create_index([('targets.email', ASCENDING)])
        _db.digest_queue.create_index([('status', ASCENDING), ('queued_at', DESCENDING)])

        if os.environ.get('SEED_DEFAULT_PREFERENCES', 'true').lower() == 'true':
            seed_default_preferences(_db)

        logger.info("Connected to MongoDB database: %s", db_name)
    return _db
