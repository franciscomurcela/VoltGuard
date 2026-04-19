from fastapi import APIRouter, Depends

from app.deps import verify_token
from app.schemas import HealthStatus
from app.state import db_datasets, db_webhooks, db_model_config, get_all_anomalies, get_all_forecasts, is_persistence_enabled

router = APIRouter(tags=["5. Health & Metrics"])


@router.get("/v1/health", response_model=HealthStatus)
async def health_check():
    db_status = "MONGODB" if is_persistence_enabled() else "IN_MEMORY"
    return HealthStatus(status="UP", database=db_status)


@router.get("/v1/metrics")
async def get_metrics(token: str = Depends(verify_token)):
    all_measurements = list(db_datasets.values())
    queued = sum(1 for item in all_measurements if item.get("training_status") == "queued")
    processing = sum(1 for item in all_measurements if item.get("training_status") == "processing")
    analyzed = sum(1 for item in all_measurements if item.get("training_status") == "analyzed")
    failed = sum(1 for item in all_measurements if item.get("training_status") == "failed")
    all_anomalies = get_all_anomalies()
    all_forecasts = get_all_forecasts()

    measurements_by_id = {item.get("measurement_id"): item for item in all_measurements}
    measurements_by_client = {}
    measurements_by_sensor = {}
    forecasts_by_client = {}

    anomalies_by_client = {}
    anomalies_by_sensor = {}
    anomalous_measurements_by_client = {}
    anomalous_measurements_by_sensor = {}

    sensors_by_client = {}
    sensor_client_map = {}

    for measurement in all_measurements:
        measurement_id = measurement.get("measurement_id")
        sensor_id = measurement.get("source_id") or "unknown"
        client_id = measurement.get("client_id") or sensor_id or "unknown"

        sensor_client_map[sensor_id] = client_id
        measurements_by_client[client_id] = measurements_by_client.get(client_id, 0) + 1
        measurements_by_sensor[sensor_id] = measurements_by_sensor.get(sensor_id, 0) + 1

        if client_id not in sensors_by_client:
            sensors_by_client[client_id] = set()
        sensors_by_client[client_id].add(sensor_id)

        if measurement_id:
            # Initialize maps for deterministic output even before anomaly arrival.
            anomalies_by_client.setdefault(client_id, anomalies_by_client.get(client_id, 0))
            anomalies_by_sensor.setdefault(sensor_id, anomalies_by_sensor.get(sensor_id, 0))

    for anomaly in all_anomalies:
        measurement_id = anomaly.get("measurement_id")
        measurement = measurements_by_id.get(measurement_id, {})
        sensor_id = anomaly.get("source_id") or measurement.get("source_id") or "unknown"
        client_id = anomaly.get("client_id") or measurement.get("client_id") or sensor_client_map.get(sensor_id) or sensor_id

        anomalies_by_client[client_id] = anomalies_by_client.get(client_id, 0) + 1
        anomalies_by_sensor[sensor_id] = anomalies_by_sensor.get(sensor_id, 0) + 1

        if client_id not in sensors_by_client:
            sensors_by_client[client_id] = set()
        sensors_by_client[client_id].add(sensor_id)

        if measurement_id:
            if client_id not in anomalous_measurements_by_client:
                anomalous_measurements_by_client[client_id] = set()
            anomalous_measurements_by_client[client_id].add(measurement_id)

            if sensor_id not in anomalous_measurements_by_sensor:
                anomalous_measurements_by_sensor[sensor_id] = set()
            anomalous_measurements_by_sensor[sensor_id].add(measurement_id)

    for forecast in all_forecasts:
        sensor_id = forecast.get("sensor_id") or "unknown"
        client_id = forecast.get("client_id") or sensor_client_map.get(sensor_id) or sensor_id
        forecasts_by_client[client_id] = forecasts_by_client.get(client_id, 0) + 1
        if client_id not in sensors_by_client:
            sensors_by_client[client_id] = set()
        sensors_by_client[client_id].add(sensor_id)

    per_sensor = []
    all_sensors = sorted(set(measurements_by_sensor) | set(anomalies_by_sensor))
    for sensor_id in all_sensors:
        sensor_measurements = measurements_by_sensor.get(sensor_id, 0)
        sensor_anomalies = anomalies_by_sensor.get(sensor_id, 0)
        sensor_anomalous_measurements = len(anomalous_measurements_by_sensor.get(sensor_id, set()))
        sensor_client_id = sensor_client_map.get(sensor_id, "unknown")

        per_sensor.append(
            {
                "sensor_id": sensor_id,
                "client_id": sensor_client_id,
                "measurements_total": sensor_measurements,
                "measurements_with_anomaly": sensor_anomalous_measurements,
                "anomalies_total": sensor_anomalies,
                "measurement_anomaly_rate": round((sensor_anomalous_measurements / sensor_measurements), 4)
                if sensor_measurements else 0.0,
                "anomalies_per_measurement": round((sensor_anomalies / sensor_measurements), 4)
                if sensor_measurements else 0.0,
            }
        )

    clients = sorted(
        set(measurements_by_client)
        | set(anomalies_by_client)
        | set(forecasts_by_client)
        | set(sensors_by_client)
    )
    per_client = []
    for client_id in clients:
        client_measurements = measurements_by_client.get(client_id, 0)
        client_anomalies = anomalies_by_client.get(client_id, 0)
        client_anomalous_measurements = len(anomalous_measurements_by_client.get(client_id, set()))
        client_sensors = sorted(sensors_by_client.get(client_id, set()))

        client_sensor_metrics = [item for item in per_sensor if item.get("sensor_id") in client_sensors]
        measurement_anomaly_rate = round((client_anomalous_measurements / client_measurements), 4) if client_measurements else 0.0
        anomalies_per_measurement = round((client_anomalies / client_measurements), 4) if client_measurements else 0.0

        per_client.append(
            {
                "client_id": client_id,
                "sensors_analyzed": len(client_sensors),
                "measurements_total": client_measurements,
                "measurements_with_anomaly": client_anomalous_measurements,
                "anomalies_total": client_anomalies,
                "forecast_requests_total": forecasts_by_client.get(client_id, 0),
                "measurement_anomaly_rate": measurement_anomaly_rate,
                "anomalies_per_measurement": anomalies_per_measurement,
                # Backward-compatible aliases
                "requests_total": client_measurements,
                "requests_with_anomaly": client_anomalous_measurements,
                "anomaly_request_rate": measurement_anomaly_rate,
                "avg_anomalies_per_request": anomalies_per_measurement,
                "per_sensor": client_sensor_metrics,
            }
        )

    top_clients = sorted(per_client, key=lambda item: item["anomalies_total"], reverse=True)[:5]
    measurements_with_anomaly = len({item.get("measurement_id") for item in all_anomalies if item.get("measurement_id")})

    return {
        "total_measurements": len(db_datasets),
        "measurements_analyzed": analyzed,
        "measurements_queued": queued,
        "measurements_processing": processing,
        "measurements_failed": failed,
        "total_anomalies": len(all_anomalies),
        "total_forecasts": len(all_forecasts),
        "active_webhooks": len(db_webhooks),
        "avg_processing_time_ms": 150.5,
        "database_mode": "MONGODB" if is_persistence_enabled() else "IN_MEMORY",
        "validation_metrics": {
            "definitions": {
                "measurement": "cada dataset submetido em /v1/measurements (1 pedido de ingestão)",
                "sensor": "source_id",
                "client": "client_id (ou source_id quando client_id não é enviado)",
            },
            "sensors_analyzed": len(all_sensors),
            "measurement_anomaly_detection_rate": (
                round(measurements_with_anomaly / analyzed, 4) if analyzed else 0.0
            ),
            "avg_anomalies_per_measurement": round((len(all_anomalies) / analyzed), 4) if analyzed else 0.0,
            "clients_monitored": len(clients),
            "per_sensor": per_sensor,
            "per_client": per_client,
            "top_clients_by_anomalies": top_clients,
        },
        "model_config": db_model_config,
        "uptime_seconds": 0,
    }
