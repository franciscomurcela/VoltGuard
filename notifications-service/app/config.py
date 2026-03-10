from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_url: str
    mongodb_database: str = "notifications_db"
    server_host: str = "0.0.0.0"
    server_port: int = 8083
    auth_token: str
    
    # Twilio credentials (handles SMS, WhatsApp, Email via SendGrid)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_phone: str = ""
    twilio_from_whatsapp: str = ""  # Format: whatsapp:+1234567890
    twilio_from_email: str = "noreply@voltguard.com"
    sendgrid_api_key: str = ""  # SendGrid API key for email
    
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
