from fastapi import APIRouter, Depends, Body

from app.deps import verify_token
from app.ingestion import periodic_ingestion_service

router = APIRouter(tags=["1. Ingestion & Measurements"])


@router.get(
    "/v1/measurements/status",
    summary="Estado da ingestão periódica de medições",
)
async def get_ingestion_status(token: str = Depends(verify_token)):
    return periodic_ingestion_service.get_status()


@router.put(
    "/v1/measurements/config",
    summary="Configurar ingestão periódica de medições",
)
async def update_ingestion_config(
    updates: dict = Body(..., description="Atualizações de configuração da ingestão periódica"),
    token: str = Depends(verify_token),
):
    return periodic_ingestion_service.update_config(updates)
