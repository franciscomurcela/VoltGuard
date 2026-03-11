import logging
import os

logger = logging.getLogger(__name__)

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False


def _get_channel_config(channel_name: str, db):
    """Look up channel config in MongoDB first, fall back to env vars."""
    doc = db.channels.find_one({'name': channel_name})
    if doc:
        return doc

    # Fallback env-var defaults (Twilio)
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN', '')
    from_phone = os.environ.get('TWILIO_FROM_PHONE', '')
    from_whatsapp = os.environ.get('TWILIO_FROM_WHATSAPP', f'whatsapp:{from_phone}' if os.environ.get('TWILIO_FROM_PHONE') else '')
    sendgrid_key = os.environ.get('SENDGRID_API_KEY', '')
    from_email = os.environ.get('TWILIO_FROM_EMAIL', os.environ.get('EMAIL_FROM', ''))

    if account_sid and auth_token:
        return {
            'name': channel_name,
            'provider': 'twilio',
            'account_sid': account_sid,
            'auth_token': auth_token,
            'from_phone': from_phone,
            'from_whatsapp': from_whatsapp,
            'sendgrid_api_key': sendgrid_key,
            'from_email': from_email,
        }
    return None


def send_notification(target: str, message: str, channel: str, db) -> dict:
    """
    Route a notification to the appropriate sub-sender based on channel name.
    Returns a dict with keys 'success' (bool) and 'message_sid' or 'error'.
    """
    config = _get_channel_config(channel, db)
    if not config:
        raise ValueError(f"No configuration found for channel '{channel}'")

    name_lower = channel.lower()
    if 'email' in name_lower:
        return _send_email(target, message, config)
    elif 'whatsapp' in name_lower:
        return _send_whatsapp(target, message, config)
    else:
        return _send_sms(target, message, config)


def _send_sms(target: str, message: str, config: dict) -> dict:
    from twilio.rest import Client
    client = Client(config['account_sid'], config['auth_token'])
    from_number = config.get('from_phone') or config.get('from_number', '')
    msg = client.messages.create(
        body=message,
        from_=from_number,
        to=target
    )
    logger.info("SMS sent, SID=%s status=%s", msg.sid, msg.status)
    return {'success': True, 'message_sid': msg.sid}


def _send_whatsapp(target: str, message: str, config: dict) -> dict:
    from twilio.rest import Client
    client = Client(config['account_sid'], config['auth_token'])
    from_wa = config.get('from_whatsapp') or f"whatsapp:{config.get('from_phone', config.get('from_number', ''))}"
    to_wa = target if target.startswith('whatsapp:') else f"whatsapp:{target}"
    msg = client.messages.create(body=message, from_=from_wa, to=to_wa)
    logger.info("WhatsApp sent, SID=%s status=%s", msg.sid, msg.status)
    return {'success': True, 'message_sid': msg.sid}


def _send_email(target: str, message: str, config: dict) -> dict:
    if not SENDGRID_AVAILABLE:
        raise RuntimeError("sendgrid package is not installed")
    api_key = config.get('sendgrid_api_key') or os.environ.get('SENDGRID_API_KEY', '')
    from_email = config.get('from_email') or os.environ.get('EMAIL_FROM', '')
    mail = Mail(from_email=from_email, to_emails=target, subject='VoltGuard Notification', plain_text_content=message)
    sg = SendGridAPIClient(api_key)
    response = sg.send(mail)
    logger.info("Email sent to %s, status=%s", target, response.status_code)
    return {'success': True, 'message_sid': None}
