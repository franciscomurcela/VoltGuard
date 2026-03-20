import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _get_channel_config(channel_name: str, db):
    """Look up channel config in MongoDB first, fall back to env vars."""
    doc = db.channels.find_one({'name': channel_name})
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN', '')
    from_phone = os.environ.get('TWILIO_FROM_PHONE', '')
    from_whatsapp = os.environ.get('TWILIO_FROM_WHATSAPP', f'whatsapp:{from_phone}' if os.environ.get('TWILIO_FROM_PHONE') else '')
    from_email = os.environ.get('SMTP_FROM_EMAIL', os.environ.get('TWILIO_FROM_EMAIL', os.environ.get('EMAIL_FROM', '')))
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    smtp_username = os.environ.get('SMTP_USERNAME', from_email)
    smtp_password = os.environ.get('SMTP_PASSWORD', os.environ.get('GOOGLE_APP_PASSWORD', ''))
    smtp_use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'

    env_defaults = {
        'name': channel_name,
        'provider': 'twilio',
        'account_sid': account_sid,
        'auth_token': auth_token,
        'from_phone': from_phone,
        'from_whatsapp': from_whatsapp,
        'from_email': from_email,
        'smtp_host': smtp_host,
        'smtp_port': smtp_port,
        'smtp_username': smtp_username,
        'smtp_password': smtp_password,
        'smtp_use_tls': smtp_use_tls,
    }

    if doc:
        merged = dict(env_defaults)
        merged.update(doc)
        return merged

    if account_sid and auth_token:
        return env_defaults

    if smtp_username and smtp_password and from_email:
        email_only = dict(env_defaults)
        email_only['provider'] = 'smtp'
        return email_only

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
    if not config.get('account_sid') or not config.get('auth_token'):
        raise RuntimeError("Twilio credentials are missing (account_sid/auth_token)")
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
    if not config.get('account_sid') or not config.get('auth_token'):
        raise RuntimeError("Twilio credentials are missing (account_sid/auth_token)")
    client = Client(config['account_sid'], config['auth_token'])
    from_wa = config.get('from_whatsapp') or f"whatsapp:{config.get('from_phone', config.get('from_number', ''))}"
    to_wa = target if target.startswith('whatsapp:') else f"whatsapp:{target}"
    msg = client.messages.create(body=message, from_=from_wa, to=to_wa)
    logger.info("WhatsApp sent, SID=%s status=%s", msg.sid, msg.status)
    return {'success': True, 'message_sid': msg.sid}


def _send_email(target: str, message: str, config: dict) -> dict:
    smtp_host = config.get('smtp_host') or os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(config.get('smtp_port') or os.environ.get('SMTP_PORT', '587'))
    smtp_username = config.get('smtp_username') or os.environ.get('SMTP_USERNAME', '')
    smtp_password = config.get('smtp_password') or os.environ.get('SMTP_PASSWORD', os.environ.get('GOOGLE_APP_PASSWORD', ''))
    smtp_use_tls = config.get('smtp_use_tls')
    if smtp_use_tls is None:
        smtp_use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'

    from_email = config.get('from_email') or os.environ.get('SMTP_FROM_EMAIL', os.environ.get('EMAIL_FROM', ''))

    if not all([smtp_host, smtp_port, smtp_username, smtp_password, from_email]):
        raise RuntimeError("SMTP is not fully configured (host/port/username/password/from_email)")

    email = EmailMessage()
    email['Subject'] = 'VoltGuard Notification'
    email['From'] = from_email
    email['To'] = target
    email.set_content(message)

    if smtp_use_tls:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(smtp_username, smtp_password)
            server.send_message(email)
    else:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ssl.create_default_context()) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(email)

    logger.info("Email sent to %s via SMTP", target)
    return {'success': True, 'message_sid': None}
