import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_token
from app.schemas import WebhookResponse, WebhookSubscription
from app.state import db_webhooks, db_model_config, save_webhook, delete_webhook as delete_webhook_state

logger = logging.getLogger("voltguard-api")
router = APIRouter(tags=["4. Webhook Management"])


@router.get("/v1/webhooks", response_model=list[WebhookResponse])
async def list_webhooks(token: str = Depends(verify_token)):
    logger.debug(f"📡 Webhooks ativos consultados: {len(db_webhooks)}")
    return list(db_webhooks.values())


@router.get("/v1/webhooks/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(webhook_id: str, token: str = Depends(verify_token)):
    webhook = db_webhooks.get(webhook_id)
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook não encontrado.",
        )
    return webhook


@router.post("/v1/webhooks", status_code=status.HTTP_201_CREATED, response_model=WebhookResponse)
async def create_webhook(webhook: WebhookSubscription, token: str = Depends(verify_token)):
    webhook_id = f"webhook_{uuid.uuid4().hex[:8]}"

    webhook_data = WebhookResponse(
        webhook_id=webhook_id,
        target_url=webhook.target_url,
        event_type=webhook.event_type,
        status="active",
        model_ids=[db_model_config["model_id"]],
    )

    save_webhook(webhook_id, webhook_data.dict())

    logger.info(f"📡 Webhook registado: {webhook_id} -> {webhook.target_url} ({webhook.event_type})")

    return webhook_data


@router.delete("/v1/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook_route(webhook_id: str, token: str = Depends(verify_token)):
    if webhook_id not in db_webhooks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook não encontrado.",
        )

    delete_webhook_state(webhook_id)
    logger.info(f"🗑️ Webhook removido: {webhook_id}")
    return None
