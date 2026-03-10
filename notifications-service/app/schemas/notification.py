from datetime import datetime
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class NotificationCreate(BaseModel):
    client_id: str = Field(..., description="Client identifier (e.g., 'energy_composer', 'anomaly_detector')")
    target: str = Field(..., description="Target: phone (+351...), whatsapp:+351..., or email")
    channel: Literal["sms", "whatsapp", "email"] = Field(..., description="Channel: 'sms', 'whatsapp', or 'email'")
    message_template: str = Field(..., description="Message template with {{variables}}")
    variables: Optional[Dict[str, Any]] = Field(None, description="Variables for template substitution")


class NotificationResponse(BaseModel):
    id: str
    client_id: str
    target: str
    channel: str
    message: str
    status: str
    provider_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListQuery(BaseModel):
    client_id: str = Field(..., description="Filter by client ID")
    limit: int = Field(25, ge=1, le=100, description="Maximum number of results")
    skip: int = Field(0, ge=0, description="Number of results to skip")
