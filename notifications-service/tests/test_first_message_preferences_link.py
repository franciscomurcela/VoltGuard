import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from bson import ObjectId

from swagger_server.controllers import notifications_controller


class FakeRequest:
    def __init__(self, payload, headers=None):
        self._payload = payload
        self.headers = headers or {}
        self.is_json = True

    def get_json(self):
        return self._payload


class FirstMessagePreferencesLinkTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            'client_id': 'energy_composer',
            'target': '+351910000000',
            'channel': 'twilio_sms',
            'alert_type': 'critical',
            'message_template': 'Alerta Critico na subestacao A.',
            'variables': {},
        }
        self.secret = 'pref_secret_target_1'

    def _build_db(self, has_previous_notification):
        db = SimpleNamespace()
        db.notifications = MagicMock()
        db.user_preferences = MagicMock()
        db.digest_queue = MagicMock()
        db.notification_audit = MagicMock()

        inserted_id = ObjectId()
        db.notifications.insert_one.return_value = SimpleNamespace(inserted_id=inserted_id)
        db.notifications.update_one.return_value = SimpleNamespace(modified_count=1)
        db.digest_queue.insert_one.return_value = SimpleNamespace(inserted_id=ObjectId())
        db.notification_audit.insert_one.return_value = SimpleNamespace(inserted_id=ObjectId())

        def notifications_find_one(query, *args, **kwargs):
            # First-notification check
            if query.get('target') == self.payload['target']:
                if has_previous_notification:
                    return {'_id': ObjectId(), 'target': self.payload['target']}
                return None
            # Idempotency lookup (not used in these tests)
            if query.get('client_id') == self.payload['client_id'] and query.get('idempotency_key'):
                return None
            return None

        db.notifications.find_one.side_effect = notifications_find_one
        db.user_preferences.find_one.return_value = {
            'secret': self.secret,
            'channels': {'sms': True, 'email': True},
            'alert_type': {'critical': 'immediate', 'warnings': 'immediate'},
        }
        return db

    def _call_post(self, db):
        fake_request = FakeRequest(self.payload)

        with patch.object(notifications_controller.connexion, 'request', fake_request, create=True), \
             patch.object(notifications_controller, 'get_db', return_value=db), \
             patch.object(notifications_controller.twilio_provider, 'send_notification', return_value={'success': True, 'message_sid': 'SM1'}) as send_mock, \
             patch.dict(os.environ, {'PREFERENCES_LINK_BASE_URL': 'http://localhost:3000/preferences'}, clear=False):
            response, status = notifications_controller.v1_notifications_post(body=self.payload)

        return response, status, send_mock

    def test_first_message_appends_preferences_link(self):
        db = self._build_db(has_previous_notification=False)

        response, status, send_mock = self._call_post(db)

        self.assertEqual(status, 201)
        self.assertEqual(response.get('status'), 'DELIVERED')
        sent_message = send_mock.call_args.args[1]
        expected_link = f'http://localhost:3000/preferences?secret={self.secret}'
        self.assertIn('Se pretende deixar de receber notificações ou alterar as suas preferências clique no link abaixo:', sent_message)
        self.assertIn(expected_link, sent_message)

    def test_non_first_message_does_not_append_preferences_link(self):
        db = self._build_db(has_previous_notification=True)

        response, status, send_mock = self._call_post(db)

        self.assertEqual(status, 201)
        self.assertEqual(response.get('status'), 'DELIVERED')
        sent_message = send_mock.call_args.args[1]
        expected_link = f'http://localhost:3000/preferences?secret={self.secret}'
        self.assertNotIn(expected_link, sent_message)
        self.assertNotIn('Se pretende deixar de receber notificações ou alterar as suas preferências clique no link abaixo:', sent_message)


if __name__ == '__main__':
    unittest.main()
