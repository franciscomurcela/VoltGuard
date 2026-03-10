import logging
from typing import Optional
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Email, To, Content
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

from app.providers.base import NotificationProvider, SendResult

logger = logging.getLogger(__name__)


class TwilioProvider(NotificationProvider):
    """
    Unified Twilio notification provider for SMS, WhatsApp, and Email.
    
    Twilio handles all channels:
    - SMS: Standard phone messaging
    - WhatsApp: Business API via Twilio
    - Email: Via SendGrid (Twilio-owned)
    """

    def __init__(
        self, 
        account_sid: str, 
        auth_token: str, 
        from_phone: str,
        from_whatsapp: Optional[str] = None,
        from_email: Optional[str] = None,
        sendgrid_api_key: Optional[str] = None
    ):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_phone = from_phone
        self.from_whatsapp = from_whatsapp or f"whatsapp:{from_phone}"
        self.from_email = from_email or "noreply@voltguard.com"
        self.sendgrid_api_key = sendgrid_api_key or auth_token
        self.client = Client(account_sid, auth_token)

    async def send(self, target: str, message: str, channel: str = "sms") -> SendResult:
        """
        Send notification via Twilio.
        
        Args:
            target: Phone number (+351...), WhatsApp number (whatsapp:+351...), or email
            message: Message content
            channel: 'sms', 'whatsapp', or 'email'
        """
        try:
            if channel == "sms":
                return await self._send_sms(target, message)
            elif channel == "whatsapp":
                return await self._send_whatsapp(target, message)
            elif channel == "email":
                return await self._send_email(target, message)
            else:
                return SendResult(
                    provider_id="",
                    status="failed",
                    error=f"Unsupported channel: {channel}"
                )
        
        except TwilioRestException as e:
            logger.error(f"Twilio {channel} error: {e.msg}")
            return SendResult(
                provider_id="",
                status="failed",
                error=f"Twilio error: {e.msg}"
            )
        except Exception as e:
            logger.error(f"Unexpected error sending {channel}: {e}")
            return SendResult(
                provider_id="",
                status="failed",
                error=str(e)
            )

    async def _send_sms(self, target: str, message: str) -> SendResult:
        """Send SMS via Twilio"""
        twilio_message = self.client.messages.create(
            body=message,
            from_=self.from_phone,
            to=target
        )

        logger.info(f"SMS sent: SID={twilio_message.sid}, status={twilio_message.status}")
        
        return SendResult(
            provider_id=twilio_message.sid,
            status=twilio_message.status,
            error=None
        )

    async def _send_whatsapp(self, target: str, message: str) -> SendResult:
        """
        Send WhatsApp message via Twilio.
        
        Target format: 'whatsapp:+351912345678' or '+351912345678'
        """
        # Ensure WhatsApp prefix
        if not target.startswith("whatsapp:"):
            target = f"whatsapp:{target}"
        
        twilio_message = self.client.messages.create(
            body=message,
            from_=self.from_whatsapp,
            to=target
        )

        logger.info(f"WhatsApp sent: SID={twilio_message.sid}, status={twilio_message.status}")
        
        return SendResult(
            provider_id=twilio_message.sid,
            status=twilio_message.status,
            error=None
        )

    async def _send_email(self, target: str, message: str) -> SendResult:
        """
        Send email via Twilio SendGrid.
        
        Note: Requires SendGrid integration with Twilio account.
        Alternative: Use messages.create() with email channel if enabled.
        """
        if not SENDGRID_AVAILABLE:
            logger.warning("SendGrid SDK not installed, email not sent")
            return SendResult(
                provider_id="email_placeholder",
                status="pending",
                error="SendGrid integration required"
            )
        
        try:
            sg = SendGridAPIClient(api_key=self.sendgrid_api_key)
            
            mail = Mail(
                from_email=Email(self.from_email),
                to_emails=To(target),
                subject="VoltGuard Notification",
                plain_text_content=Content("text/plain", message)
            )
            
            response = sg.send(mail)
            
            logger.info(f"Email sent: status_code={response.status_code}")
            
            return SendResult(
                provider_id=response.headers.get('X-Message-Id', 'email_sent'),
                status="sent" if response.status_code == 202 else "failed",
                error=None
            )
            
        except Exception as e:
            logger.error(f"Email send error: {e}")
            return SendResult(
                provider_id="",
                status="failed",
                error=str(e)
            )

    def provider_name(self) -> str:
        return "twilio"
