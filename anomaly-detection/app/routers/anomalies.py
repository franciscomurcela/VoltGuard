import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_token
from app.schemas import PaginatedAnomalyResponse, AnomalySummary, AnomalyDetail
from app.state import get_all_anomalies, get_anomaly

logger = logging.getLogger("voltguard-api")
router = APIRouter(tags=["2. Anomaly Registry"])


@router.get("/v1/anomalies", response_model=PaginatedAnomalyResponse)
async def list_anomalies(
    source_id: Optional[str] = None,
    measurement_id: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
    token: str = Depends(verify_token),
):
    anomalies = get_all_anomalies()
    total = len(anomalies)

    if source_id:
        anomalies = [a for a in anomalies if a.get("source_id") == source_id]
        total = len(anomalies)
        logger.debug(f"🔍 Filtro aplicado: source_id={source_id}, resultados={total}")

    if measurement_id:
        anomalies = [a for a in anomalies if a.get("measurement_id") == measurement_id]
        total = len(anomalies)
        logger.debug(f"🔍 Filtro aplicado: measurement_id={measurement_id}, resultados={total}")

    paginated = anomalies[offset:offset + limit]
    has_more = (offset + limit) < total

    items = [
        AnomalySummary(
            anomaly_id=a.get("anomaly_id", ""),
            measurement_id=a.get("measurement_id", ""),
            source_id=a.get("source_id", ""),
            timestamp=a.get("timestamp", ""),
            severity=a.get("severity", "medium"),
        )
        for a in paginated
    ]

    logger.info(f"📋 Listagem de anomalias: {len(items)} de {total} (offset={offset}, limit={limit})")

    return PaginatedAnomalyResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=has_more,
    )


@router.get("/v1/anomalies/{anomaly_id}", response_model=AnomalyDetail)
async def get_anomaly_detail(anomaly_id: str, token: str = Depends(verify_token)):
    anomaly = get_anomaly(anomaly_id)
    if not anomaly:
        logger.warning(f"⚠️ Anomalia não encontrada: {anomaly_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anomalia não encontrada.",
        )

    logger.debug(f"🔎 Detalhes da anomalia solicitados: {anomaly_id}")
    return AnomalyDetail(**anomaly)
