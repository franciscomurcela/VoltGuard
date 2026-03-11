import logging
import os

from pymongo import MongoClient, ASCENDING, DESCENDING

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
        logger.info("Connected to MongoDB database: %s", db_name)
    return _db
