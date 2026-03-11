"""
VoltGuard - Anomaly Detection Worker
Celery worker for asynchronous processing of sensor measurements
"""
import logging
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
import random
import redis
from celery_config import celery_app

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis connection for shared data storage
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# Helper functions for Redis operations
def save_job_to_redis(job_id: str, job_data: Dict[str, Any]) -> None:
    """Save job data to Redis."""
    redis_client.set(f"jobs:{job_id}", json.dumps(job_data))
    redis_client.sadd("jobs:index", job_id)

def get_job_from_redis(job_id: str) -> Optional[Dict[str, Any]]:
    """Get job data from Redis."""
    data = redis_client.get(f"jobs:{job_id}")
    return json.loads(data) if data else None

def save_anomaly_to_redis(anomaly_id: str, anomaly_data: Dict[str, Any]) -> None:
    """Save anomaly data to Redis."""
    redis_client.set(f"anomalies:{anomaly_id}", json.dumps(anomaly_data))
    redis_client.sadd("anomalies:index", anomaly_id)

def get_anomaly_from_redis(anomaly_id: str) -> Optional[Dict[str, Any]]:
    """Get anomaly data from Redis."""
    data = redis_client.get(f"anomalies:{anomaly_id}")
    return json.loads(data) if data else None


@celery_app.task(name="process_sensor_measurements")
def process_sensor_measurements(
    job_id: str,
    sensor_id: str,
    measurements: List[Dict[str, Any]],
    context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Process measurements from a single sensor with contextual information.
    
    Args:
        job_id: Unique job identifier
        sensor_id: Sensor identifier (source_id)
        measurements: List of measurements from this sensor
        context: Contextual variables (hour, day_of_week, num_users, temperature, location, etc.)
    
    Returns:
        Processing results with detected anomalies
    """
    logger.info(f"🔄 Processing job {job_id} for sensor {sensor_id}")
    logger.info(f"📊 Measurements count: {len(measurements)}")
    if context:
        logger.info(f"🔍 Context: {context}")
    
    try:
        # Update job status to PROCESSING
        job_data = get_job_from_redis(job_id)
        if job_data:
            job_data["status"] = "PROCESSING"
            job_data["started_at"] = datetime.utcnow().isoformat()
            save_job_to_redis(job_id, job_data)
        
        # Extract contextual features for anomaly detection
        hour_of_day = context.get("hour", 0) if context else 0
        day_of_week = context.get("day_of_week", 0) if context else 0
        num_users = context.get("num_users", 0) if context else 0
        temperature = context.get("temperature") if context else None
        location = context.get("location", "unknown") if context else "unknown"
        
        # Process each measurement for anomaly detection
        detected_anomalies = []
        
        for measurement in measurements:
            metric_name = measurement.get("metric_name")
            value = measurement.get("value")
            timestamp = measurement.get("timestamp")
            unit = measurement.get("unit", "")
            
            # Anomaly detection logic (MOCKUP - will be replaced with Prophet/PyOD)
            # Consider contextual variables for smarter detection
            is_anomaly = _detect_anomaly_with_context(
                sensor_id=sensor_id,
                metric_name=metric_name,
                value=value,
                hour=hour_of_day,
                day_of_week=day_of_week,
                num_users=num_users,
                temperature=temperature
            )
            
            if is_anomaly:
                anomaly = _create_anomaly_record(
                    sensor_id=sensor_id,
                    metric_name=metric_name,
                    value=value,
                    timestamp=timestamp,
                    unit=unit,
                    context=context
                )
                detected_anomalies.append(anomaly)
                
                # Store in Redis
                anomaly_id = anomaly["id"]
                save_anomaly_to_redis(anomaly_id, anomaly)
                
                logger.warning(f"⚠️ Anomaly detected: {metric_name}={value}{unit} at {timestamp}")
        
        # Update job status to COMPLETED
        job_data = get_job_from_redis(job_id)
        if job_data:
            job_data["status"] = "COMPLETED"
            job_data["completed_at"] = datetime.utcnow().isoformat()
            job_data["result"] = {
                "sensor_id": sensor_id,
                "total_measurements": len(measurements),
                "anomalies_detected": len(detected_anomalies),
                "anomaly_ids": [a["id"] for a in detected_anomalies]
            }
            save_job_to_redis(job_id, job_data)
        
        logger.info(f"✅ Job {job_id} completed - {len(detected_anomalies)} anomalies detected")
        
        return {
            "job_id": job_id,
            "sensor_id": sensor_id,
            "status": "COMPLETED",
            "total_measurements": len(measurements),
            "anomalies_detected": len(detected_anomalies),
            "anomaly_ids": [a["id"] for a in detected_anomalies]
        }
        
    except Exception as e:
        logger.error(f"❌ Error processing job {job_id}: {str(e)}")
        
        # Update job status to FAILED
        job_data = get_job_from_redis(job_id)
        if job_data:
            job_data["status"] = "FAILED"
            job_data["completed_at"] = datetime.utcnow().isoformat()
            job_data["error"] = str(e)
            save_job_to_redis(job_id, job_data)
        
        raise


def _detect_anomaly_with_context(
    sensor_id: str,
    metric_name: str,
    value: float,
    hour: int,
    day_of_week: int,
    num_users: int,
    temperature: float = None
) -> bool:
    """
    Detect anomalies considering contextual variables.
    
    MOCKUP LOGIC - Will be replaced with ML models (Prophet, PyOD)
    
    Context-aware rules:
    - Higher thresholds during peak hours (9-18h)
    - Different baselines for weekdays vs weekends
    - Adjust expected values based on number of users
    - Temperature correlation for certain metrics
    """
    
    # MOCKUP: 30% random detection for now
    base_probability = 0.3
    
    # Adjust probability based on context
    if hour >= 9 and hour <= 18:
        # Peak hours - higher tolerance for variations
        base_probability *= 0.7
    
    if day_of_week >= 5:  # Weekend (Saturday=5, Sunday=6)
        # Weekend - different baseline
        base_probability *= 0.8
    
    # High number of users - expect higher consumption
    if num_users > 100:
        base_probability *= 0.6
    
    # Extreme values are more likely to be anomalies
    if value > 1000 or value < 0:
        base_probability = 0.9
    
    return random.random() < base_probability


def _create_anomaly_record(
    sensor_id: str,
    metric_name: str,
    value: float,
    timestamp: str,
    unit: str,
    context: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Create an anomaly record with all relevant information."""
    
    anomaly_id = f"ANM-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{random.randint(1000, 9999)}"
    
    anomaly = {
        "id": anomaly_id,
        "sensor_id": sensor_id,
        "metric_name": metric_name,
        "value": value,
        "unit": unit,
        "timestamp": timestamp,
        "detected_at": datetime.utcnow().isoformat(),
        "severity": _calculate_severity(value),
        "status": "OPEN",
        "context": context or {}
    }
    
    return anomaly


def _calculate_severity(value: float) -> str:
    """Calculate anomaly severity based on value (MOCKUP)."""
    if abs(value) > 1000:
        return "CRITICAL"
    elif abs(value) > 500:
        return "HIGH"
    elif abs(value) > 100:
        return "MEDIUM"
    else:
        return "LOW"
