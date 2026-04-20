import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_token
from app.schemas import PaginatedAnomalyResponse, AnomalySummary, AnomalyDetail, SensorAnomalyAggregate, SensorAnomalyAggregateResponse
from app.state import get_all_anomalies, get_anomaly, db_datasets

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


@router.get("/v1/anomalies/by-sensor", response_model=SensorAnomalyAggregateResponse)
async def get_anomalies_by_sensor(
    source_id: Optional[str] = None,
    client_id: Optional[str] = None,
    token: str = Depends(verify_token),
):
    measurements = list(db_datasets.values())
    anomalies = get_all_anomalies()

    measurements_by_sensor: dict[str, list[dict]] = {}
    for measurement in measurements:
        sensor = measurement.get("source_id")
        if not sensor:
            continue
        if source_id and sensor != source_id:
            continue
        if client_id and (measurement.get("client_id") or sensor) != client_id:
            continue
        measurements_by_sensor.setdefault(sensor, []).append(measurement)

    anomalies_by_sensor: dict[str, list[dict]] = {}
    for anomaly in anomalies:
        sensor = anomaly.get("source_id")
        if not sensor:
            continue
        if source_id and sensor != source_id:
            continue

        if client_id:
            anomaly_client_id = anomaly.get("client_id")
            if not anomaly_client_id:
                linked_measurement = next(
                    (
                        item for item in measurements_by_sensor.get(sensor, [])
                        if item.get("measurement_id") == anomaly.get("measurement_id")
                    ),
                    None,
                )
                anomaly_client_id = linked_measurement.get("client_id") if linked_measurement else sensor
            if anomaly_client_id != client_id:
                continue

        anomalies_by_sensor.setdefault(sensor, []).append(anomaly)

    sensor_ids = sorted(set(measurements_by_sensor) | set(anomalies_by_sensor))
    items: list[SensorAnomalyAggregate] = []

    for sensor in sensor_ids:
        sensor_measurements = measurements_by_sensor.get(sensor, [])
        sensor_anomalies = anomalies_by_sensor.get(sensor, [])

        measurement_ids_with_anomaly = {
            item.get("measurement_id")
            for item in sensor_anomalies
            if item.get("measurement_id")
        }
        measurement_ids_with_anomaly = {item for item in measurement_ids_with_anomaly if item}

        latest_anomaly = max(
            sensor_anomalies,
            key=lambda item: item.get("timestamp") or "",
            default=None,
        )

        resolved_client_id = None
        if sensor_measurements:
            sensor_measurements.sort(key=lambda item: item.get("uploaded_at") or "", reverse=True)
            resolved_client_id = sensor_measurements[0].get("client_id")
        if not resolved_client_id and latest_anomaly:
            resolved_client_id = latest_anomaly.get("client_id")

        measurements_total = len(sensor_measurements)
        anomalies_total = len(sensor_anomalies)
        measurements_with_anomaly = len(measurement_ids_with_anomaly)

        items.append(
            SensorAnomalyAggregate(
                source_id=sensor,
                client_id=resolved_client_id or sensor,
                measurements_total=measurements_total,
                measurements_with_anomaly=measurements_with_anomaly,
                anomalies_total=anomalies_total,
                measurement_anomaly_rate=(
                    round(measurements_with_anomaly / measurements_total, 4)
                    if measurements_total else 0.0
                ),
                anomalies_per_measurement=(
                    round(anomalies_total / measurements_total, 4)
                    if measurements_total else 0.0
                ),
                latest_anomaly_id=latest_anomaly.get("anomaly_id") if latest_anomaly else None,
                latest_anomaly_timestamp=latest_anomaly.get("timestamp") if latest_anomaly else None,
                latest_severity=latest_anomaly.get("severity") if latest_anomaly else None,
            )
        )

    items.sort(key=lambda item: item.anomalies_total, reverse=True)
    return SensorAnomalyAggregateResponse(items=items, total_sensors=len(items))


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
