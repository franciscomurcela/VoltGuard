from fastapi import APIRouter, Depends

from app.deps import verify_token
from app.schemas import HealthStatus
from app.state import db_datasets, db_webhooks, db_model_config, get_all_anomalies, is_persistence_enabled

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

    return {
        "total_measurements": len(db_datasets),
        "measurements_analyzed": analyzed,
        "measurements_queued": queued,
        "measurements_processing": processing,
        "measurements_failed": failed,
        "total_anomalies": len(all_anomalies),
        "active_webhooks": len(db_webhooks),
        "avg_processing_time_ms": 150.5,
        "model_config": db_model_config,
        "uptime_seconds": 0,
    }
