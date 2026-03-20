import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def seed_default_preferences(db):
    now = datetime.now(tz=timezone.utc)

    seed_users = [
        {
            'secret': 'pref_secret_joao_silva',
            'user_id': 'op_joao_silva',
            'targets': {
                'sms': '+351935586638',
                'email': 'franciscomurcela0@gmail.com',
            },
            'channels': {
                'sms': True,
                'email': True,
            },
            'alert_type': {
                'critical': 'immediate',
                'warnings': 'immediate',
            },
            'updated_at': now,
        },
        {
            'secret': 'pref_secret_maria_costa',
            'user_id': 'op_maria_costa',
            'targets': {
                'sms': '+351935586638',
                'email': 'boomchico7@gmail.com',
            },
            'channels': {
                'sms': True,
                'email': True,
            },
            'alert_type': {
                'critical': 'immediate',
                'warnings': 'immediate',
            },
            'updated_at': now,
        },
    ]

    for user in seed_users:
        db.user_preferences.update_one(
            {'secret': user['secret']},
            {
                '$set': user,
                '$setOnInsert': {'created_at': now},
            },
            upsert=True,
        )

    logger.info('Default user_preferences seed ensured (%d users)', len(seed_users))


if __name__ == '__main__':
    from swagger_server.db import get_db

    database = get_db()
    seed_default_preferences(database)
    print('Seed complete: user_preferences')
