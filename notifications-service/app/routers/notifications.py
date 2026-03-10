from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.models.notification import NotificationLog
from app.schemas.notification import NotificationCreate, NotificationResponse
from app.providers.twilio import TwilioProvider
from app.utils import process_template
from app.config import settings

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification_data: NotificationCreate,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Send a notification via Twilio (SMS, WhatsApp, or Email) and log it"""
    # Process template
    message = process_template(notification_data.message_template, notification_data.variables)
    
    # Create notification log
    notification_log = NotificationLog(
        client_id=notification_data.client_id,
        target=notification_data.target,
        channel=notification_data.channel,
        message=message,
        variables=notification_data.variables,
        status="pending"
    )
    
    # Send via Twilio (handles SMS, WhatsApp, and Email)
    try:
        provider = TwilioProvider(
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
            from_phone=settings.twilio_from_phone,
            from_whatsapp=settings.twilio_from_whatsapp,
            from_email=settings.twilio_from_email,
            sendgrid_api_key=settings.sendgrid_api_key
        )
        
        result = await provider.send(
            target=notification_data.target,
            message=message,
            channel=notification_data.channel
        )
        
        if result.error:
            notification_log.status = "failed"
            notification_log.error_message = result.error
        else:
            notification_log.status = "sent"
            notification_log.provider_id = result.provider_id
            
    except Exception as e:
        notification_log.status = "failed"
        notification_log.error_message = str(e)
    
    # Insert into MongoDB
    doc = notification_log.dict(by_alias=True, exclude={"id"})
    result = await db.notifications.insert_one(doc)
    notification_log.id = result.inserted_id
    
    return NotificationResponse(
        id=str(notification_log.id),
        client_id=notification_log.client_id,
        target=notification_log.target,
        channel=notification_log.channel,
        message=notification_log.message,
        status=notification_log.status,
        provider_id=notification_log.provider_id,
        error_message=notification_log.error_message,
        created_at=notification_log.created_at
    )


@router.get("/client/{client_id}", response_model=List[NotificationResponse])
async def list_client_notifications(
    client_id: str = Path(..., description="Client ID to filter notifications"),
    limit: int = Query(25, ge=1, le=100, description="Maximum number of results"),
    skip: int = Query(0, ge=0, description="Number of results to skip"),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List notification logs for a specific client (isolated view per client)"""
    cursor = db.notifications.find(
        {"client_id": client_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    notifications = []
    async for doc in cursor:
        notifications.append(NotificationResponse(
            id=str(doc["_id"]),
            client_id=doc["client_id"],
            target=doc["target"],
            channel=doc["channel"],
            message=doc["message"],
            status=doc["status"],
            provider_id=doc.get("provider_id"),
            error_message=doc.get("error_message"),
            created_at=doc["created_at"]
        ))
    
    return notifications


@router.get("/{client_id}/{notification_id}", response_model=NotificationResponse)
async def get_client_notification(
    client_id: str = Path(..., description="Client ID that owns the notification"),
    notification_id: str = Path(..., description="Notification ID"),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get specific notification log by ID (client-isolated)"""
    from bson import ObjectId
    from bson.errors import InvalidId
    
    try:
        doc = await db.notifications.find_one({
            "_id": ObjectId(notification_id),
            "client_id": client_id  # Ensure client can only access their own notifications
        })
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"message": "Invalid notification ID format", "type": "ValidationException", "code": 400}}
        )
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"message": "Notification not found or access denied", "type": "NotFound", "code": 404}}
        )
    
    return NotificationResponse(
        id=str(doc["_id"]),
        client_id=doc["client_id"],
        target=doc["target"],
        channel=doc["channel"],
        message=doc["message"],
        status=doc["status"],
        provider_id=doc.get("provider_id"),
        error_message=doc.get("error_message"),
        created_at=doc["created_at"]
    )
