from fastapi import FastAPI, Header, HTTPException, status, Depends
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
import uuid
import json
import os
from datetime import datetime, timedelta
import logging
import random
import redis

# Import Celery task
from worker import process_sensor_measurements

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("voltguard-api")

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

def get_all_jobs_from_redis() -> List[Dict[str, Any]]:
    """Get all jobs from Redis."""
    job_ids = redis_client.smembers("jobs:index")
    jobs = []
    for job_id in job_ids:
        job = get_job_from_redis(job_id)
        if job:
            jobs.append(job)
    return jobs

def save_anomaly_to_redis(anomaly_id: str, anomaly_data: Dict[str, Any]) -> None:
    """Save anomaly data to Redis."""
    redis_client.set(f"anomalies:{anomaly_id}", json.dumps(anomaly_data))
    redis_client.sadd("anomalies:index", anomaly_id)

def get_anomaly_from_redis(anomaly_id: str) -> Optional[Dict[str, Any]]:
    """Get anomaly data from Redis."""
    data = redis_client.get(f"anomalies:{anomaly_id}")
    return json.loads(data) if data else None

def get_all_anomalies_from_redis() -> List[Dict[str, Any]]:
    """Get all anomalies from Redis."""
    anomaly_ids = redis_client.smembers("anomalies:index")
    anomalies = []
    for anomaly_id in anomaly_ids:
        anomaly = get_anomaly_from_redis(anomaly_id)
        if anomaly:
            anomalies.append(anomaly)
    return anomalies

#inicia a aplicaçao
app = FastAPI(
    title="VoltGuard - Anomalies Detection API",
    description="Plataforma Enterprise de observabilidade assíncrona. Ingestão massiva de telemetria, análise matemática via Machine Learning e gestão de governança da API.",
    version="3.0.0"
)

#modelos de dados
class ContextData(BaseModel):
    """Contextual information for better anomaly detection"""
    hour: Optional[int] = Field(None, ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="Day of week (0=Monday, 6=Sunday)")
    num_users: Optional[int] = Field(None, ge=0, description="Number of active users")
    temperature: Optional[float] = Field(None, description="Ambient temperature in Celsius")
    location: Optional[str] = Field(None, max_length=100, description="Geographic location")
    custom_fields: Optional[Dict[str, Any]] = Field(None, description="Additional custom context fields")

class MetricData(BaseModel):
    source_id: str = Field(..., min_length=1, max_length=100, description="ID do nó da grelha")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    metrics: Dict[str, float] = Field(..., min_items=1, description="Métricas coletadas")
    context: Optional[ContextData] = Field(None, description="Contextual variables for anomaly detection")
    
    @validator('metrics')
    def validate_metrics(cls, v):
        for key, value in v.items():
            if not isinstance(value, (int, float)):
                raise ValueError(f"Métrica '{key}' deve ser numérica")
        return v

class MeasurementRequest(BaseModel):
    data: List[MetricData] = Field(..., min_items=1, max_items=1000)

class MeasurementResponse(BaseModel):
    measurement_id: str
    status: str

class MeasurementStatus(BaseModel):
    measurement_id: str
    status: str
    anomalies_detected: bool

class AnomalySummary(BaseModel):
    anomaly_id: str
    source_id: str
    timestamp: str
    severity: str

class AnomalyDetail(BaseModel):
    anomaly_id: str
    source_id: str
    timestamp: str
    trigger_metrics: Dict[str, Any]
    detection_method: str
    confidence_score: float

class ModelConfig(BaseModel):
    prophet_uncertainty_interval: float = Field(..., ge=0.5, le=0.99, description="Intervalo de incerteza (0.5-0.99)")
    pyod_contamination_rate: float = Field(..., ge=0.01, le=0.5, description="Taxa de contaminação (0.01-0.5)")

class WebhookSubscription(BaseModel):
    target_url: str = Field(..., pattern=r'^https?://', description="URL do webhook (http/https)")
    event_type: str = Field(..., pattern=r'^(anomaly_detected|measurement_processed|all)$')

class WebhookResponse(BaseModel):
    webhook_id: str
    target_url: str
    event_type: str
    status: str

class HealthStatus(BaseModel):
    status: str
    database: str

class TokenRequest(BaseModel):
    service_name: str = Field(..., min_length=3, max_length=100)

class PaginatedAnomalyResponse(BaseModel):
    items: List[AnomalySummary]
    total: int
    limit: int
    offset: int
    has_more: bool

class TokenResponse(BaseModel):
    token_id: str
    token: str
    service_name: str
    created_at: str

# Simulação de base de dados em memória (apenas para dados temporários)
db_measurements = {}  # {measurement_id: {status, job_ids, submitted_at}}
db_webhooks = {}  # {webhook_id: WebhookSubscription}
db_tokens = {"token_do_composer_123": "Energy Composer", "token_admin_999": "Admin Service"}  # {token: service_name}
db_model_config = {
    "prophet_uncertainty_interval": 0.95,
    "pyod_contamination_rate": 0.05
}

# Função auxiliar para criar anomalias mockup
def create_sample_anomalies():
    """Pré-popula o sistema com anomalias de exemplo para testes."""
    sample_anomalies = [
        {
            "anomaly_id": "anom_001",
            "source_id": "node_01",
            "timestamp": (datetime.now() - timedelta(hours=2)).isoformat(),
            "trigger_metrics": {"voltage": 245.5, "current": 85.2, "power_factor": 0.92},
            "detection_method": "Prophet",
            "confidence_score": 0.87
        },
        {
            "anomaly_id": "anom_002",
            "source_id": "node_03",
            "timestamp": (datetime.now() - timedelta(hours=5)).isoformat(),
            "trigger_metrics": {"voltage": 198.3, "current": 120.8, "frequency": 49.2},
            "detection_method": "PyOD",
            "confidence_score": 0.93
        },
        {
            "anomaly_id": "anom_003",
            "source_id": "node_01",
            "timestamp": (datetime.now() - timedelta(hours=8)).isoformat(),
            "trigger_metrics": {"voltage": 234.1, "current": 95.5, "temperature": 78.3},
            "detection_method": "Prophet",
            "confidence_score": 0.75
        },
        {
            "anomaly_id": "anom_004",
            "source_id": "node_05",
            "timestamp": (datetime.now() - timedelta(hours=12)).isoformat(),
            "trigger_metrics": {"voltage": 252.7, "current": 102.3, "power_draw": 320.5},
            "detection_method": "PyOD",
            "confidence_score": 0.81
        }
    ]
    
    for anom in sample_anomalies:
        # Save to Redis instead of local dict
        save_anomaly_to_redis(anom["anomaly_id"], anom)
    
    logger.info(f"✓ Pré-populadas {len(sample_anomalies)} anomalias de exemplo no Redis")

# NOTE: simulate_processing function removed - now using Celery worker

#verificar os tokens
def verify_token(x_app_token: str = Header(alias="X-App-Token")):
    # Num cenário real, isto ia à Base de Dados verificar se o token existe
    if x_app_token not in db_tokens:
        logger.warning(f"⚠️ Tentativa de acesso com token inválido")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Token inválido ou revogado."
        )
    logger.debug(f"Token validado: {db_tokens[x_app_token]}")
    return x_app_token

# Evento de startup para carregar dados mockup
@app.on_event("startup")
async def startup_event():
    """Inicializa o sistema com dados de exemplo."""
    logger.info("🚀 VoltGuard API iniciando...")
    create_sample_anomalies()
    logger.info("✅ Sistema pronto para receber requisições")

#endpoints

# --- 6. Health & Metrics Service ---
@app.get("/v1/health", tags=["6. Health & Metrics Service"], response_model=HealthStatus)
async def health_check():
    """Liveness Probe - Endpoint público para verificar se a API está viva (Não pede Token)."""
    logger.debug("Health check solicitado")
    return HealthStatus(status="UP", database="CONNECTED")

@app.get("/v1/metrics", tags=["6. Health & Metrics Service"])
async def get_metrics(token: str = Depends(verify_token)):
    """Métricas Internas da API - Estatísticas de uso para dashboards (Grafana)."""
    
    # Count jobs by status from Redis
    all_jobs = get_all_jobs_from_redis()
    completed_jobs = sum(1 for j in all_jobs if j.get("status") == "COMPLETED")
    pending_jobs = sum(1 for j in all_jobs if j.get("status") == "PENDING")
    processing_jobs = sum(1 for j in all_jobs if j.get("status") == "PROCESSING")
    failed_jobs = sum(1 for j in all_jobs if j.get("status") == "FAILED")
    
    # Count anomalies from Redis
    all_anomalies = get_all_anomalies_from_redis()
    
    return {
        "total_measurements": len(db_measurements),
        "total_jobs": len(all_jobs),
        "jobs_completed": completed_jobs,
        "jobs_pending": pending_jobs,
        "jobs_processing": processing_jobs,
        "jobs_failed": failed_jobs,
        "total_anomalies": len(all_anomalies),
        "active_webhooks": len(db_webhooks),
        "avg_processing_time_ms": 150.5,
        "model_config": db_model_config,
        "uptime_seconds": 0  # Mockup
    }

# --- 7. Token Management Service ---
@app.post("/v1/auth/tokens", status_code=status.HTTP_201_CREATED, tags=["7. Token Management Service"], response_model=TokenResponse)
async def create_token(token_request: TokenRequest, token: str = Depends(verify_token)):
    """Gerar novo App Token - Cria uma nova chave de acesso para um serviço."""
    
    token_id = f"token_{uuid.uuid4().hex[:12]}"
    new_token = f"vg_{uuid.uuid4().hex}"
    
    # Adiciona o novo token à base de dados
    db_tokens[new_token] = token_request.service_name
    
    logger.info(f"🔑 Novo token gerado para: {token_request.service_name}")
    
    return TokenResponse(
        token_id=token_id,
        token=new_token,
        service_name=token_request.service_name,
        created_at=datetime.now().isoformat()
    )

@app.delete("/v1/auth/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["7. Token Management Service"])
async def revoke_token(token_id: str, token: str = Depends(verify_token)):
    """Revogar Token - Invalida imediatamente o acesso de um token comprometido."""
    
    # Procura e remove o token da base de dados
    # Nota: Em produção, usaríamos o token_id para identificar na BD
    # Aqui é uma simulação simplificada
    removed = False
    for tok in list(db_tokens.keys()):
        if tok.startswith("vg_"):  # Remove tokens gerados dinamicamente
            del db_tokens[tok]
            removed = True
            logger.info(f"🗑️ Token revogado: {token_id}")
            break
    
    if not removed:
        logger.warning(f"⚠️ Tentativa de revogar token inexistente: {token_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token não encontrado."
        )
    
    return None

# --- 1. Ingestion Service ---
@app.post("/v1/measurements", status_code=status.HTTP_202_ACCEPTED, tags=["1. Ingestion Service"], response_model=MeasurementResponse)
async def ingest_measurements(
    request: MeasurementRequest,
    token: str = Depends(verify_token)
):
    """Recebe as métricas do Composer e envia para processamento via Celery."""
    
    # Generate unique measurement ID for this submission
    measurement_id = f"meas_{uuid.uuid4().hex[:8]}"
    
    # Group measurements by sensor (source_id)
    sensors_data = {}
    for metric_data in request.data:
        sensor_id = metric_data.source_id
        if sensor_id not in sensors_data:
            sensors_data[sensor_id] = []
        sensors_data[sensor_id].append(metric_data)
    
    # Create one Celery job per sensor
    job_ids = []
    for sensor_id, measurements in sensors_data.items():
        # Generate unique job ID
        job_id = f"JOB-{uuid.uuid4().hex[:12]}"
        job_ids.append(job_id)
        
        # Prepare measurements data for worker
        measurements_list = []
        for m in measurements:
            for metric_name, metric_value in m.metrics.items():
                measurements_list.append({
                    "metric_name": metric_name,
                    "value": metric_value,
                    "timestamp": m.timestamp,
                    "unit": ""  # Could be extracted from metric_name or added to model
                })
        
        # Extract context from first measurement (if available)
        context = None
        if measurements[0].context:
            context = measurements[0].context.dict(exclude_none=True)
        
        # Initialize job in Redis
        job_data = {
            "job_id": job_id,
            "measurement_id": measurement_id,
            "sensor_id": sensor_id,
            "status": "PENDING",
            "submitted_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "total_measurements": len(measurements_list),
            "result": None,
            "error": None
        }
        save_job_to_redis(job_id, job_data)
        
        # Send to Celery queue (RabbitMQ)
        process_sensor_measurements.delay(
            job_id=job_id,
            sensor_id=sensor_id,
            measurements=measurements_list,
            context=context
        )
        
        logger.info(f"📤 Job {job_id} enviado para fila: sensor={sensor_id}, measurements={len(measurements_list)}")
    
    # Store measurement submission info
    db_measurements[measurement_id] = {
        "measurement_id": measurement_id,
        "status": "raw",
        "job_ids": job_ids,
        "submitted_at": datetime.utcnow().isoformat(),
        "total_sensors": len(sensors_data),
        "total_data_points": len(request.data)
    }
    
    logger.info(f"📥 Medição recebida: {measurement_id} ({len(sensors_data)} sensores, {len(job_ids)} jobs criados)")
    
    # Return 202 Accepted immediately
    return MeasurementResponse(
        measurement_id=measurement_id,
        status="raw"
    )

# --- 2. Job Tracking Service ---
@app.get("/v1/measurements/{measurement_id}", tags=["2. Job Tracking Service"], response_model=MeasurementStatus)
async def get_measurement_status(measurement_id: str, token: str = Depends(verify_token)):
    """Consultar estado do Job (Polling) - Verifica se os dados submetidos já foram analisados."""
    
    if measurement_id not in db_measurements:
        logger.warning(f"⚠️ Measurement não encontrado: {measurement_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Measurement não encontrado."
        )
    
    measurement = db_measurements[measurement_id]
    job_ids = measurement.get("job_ids", [])
    
    # Check status of all jobs for this measurement from Redis
    all_completed = True
    any_failed = False
    has_anomalies = False
    
    for job_id in job_ids:
        job = get_job_from_redis(job_id)
        if job:
            if job.get("status") not in ["COMPLETED", "FAILED"]:
                all_completed = False
            if job.get("status") == "FAILED":
                any_failed = True
            if job.get("result") and job["result"].get("anomalies_detected", 0) > 0:
                has_anomalies = True
    
    # Determine overall status (only "raw" or "analyzed")
    if all_completed:
        overall_status = "analyzed"
    else:
        overall_status = "raw"  # Still processing or pending
    
    logger.debug(f"📊 Status consultado: {measurement_id} - {overall_status}")
    
    return MeasurementStatus(
        measurement_id=measurement_id,
        status=overall_status,
        anomalies_detected=has_anomalies
    )

# --- 3. Anomaly Registry Service ---
@app.get("/v1/anomalies", tags=["3. Anomaly Registry Service"], response_model=PaginatedAnomalyResponse)
async def list_anomalies(
    source_id: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
    token: str = Depends(verify_token)
):
    """Listar todas as anomalias com suporte a filtros e paginação."""
    
    # Get all anomalies from Redis
    anomalies = get_all_anomalies_from_redis()
    total = len(anomalies)
    
    # Filtrar por source_id se fornecido
    if source_id:
        anomalies = [a for a in anomalies if a.get("source_id") == source_id]
        total = len(anomalies)
        logger.debug(f"🔍 Filtro aplicado: source_id={source_id}, resultados={total}")
    
    # Aplicar paginação
    paginated = anomalies[offset:offset + limit]
    has_more = (offset + limit) < total
    
    items = [
        AnomalySummary(
            anomaly_id=a.get("anomaly_id", ""),
            source_id=a.get("source_id", ""),
            timestamp=a.get("timestamp", ""),
            severity=a.get("severity", "medium")
        )
        for a in paginated
    ]
    
    logger.info(f"📋 Listagem de anomalias: {len(items)} de {total} (offset={offset}, limit={limit})")
    
    return PaginatedAnomalyResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=has_more
    )

@app.get("/v1/anomalies/{anomaly_id}", tags=["3. Anomaly Registry Service"], response_model=AnomalyDetail)
async def get_anomaly_detail(anomaly_id: str, token: str = Depends(verify_token)):
    """Detalhes exatos da anomalia - Exibe o relatório matemático justificando o motivo do alerta."""
    
    anomaly = get_anomaly_from_redis(anomaly_id)
    if not anomaly:
        logger.warning(f"⚠️ Anomalia não encontrada: {anomaly_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anomalia não encontrada."
        )
    
    logger.debug(f"🔎 Detalhes da anomalia solicitados: {anomaly_id}")
    return AnomalyDetail(**anomaly)

# --- 4. Model Management Service ---
@app.get("/v1/models/config", tags=["4. Model Management Service"], response_model=ModelConfig)
async def get_model_config(token: str = Depends(verify_token)):
    """Consultar calibração da IA - Devolve os parâmetros matemáticos atuais."""
    logger.debug("⚙️ Configuração do modelo consultada")
    return ModelConfig(**db_model_config)

@app.put("/v1/models/config", tags=["4. Model Management Service"], response_model=ModelConfig)
async def update_model_config(config: ModelConfig, token: str = Depends(verify_token)):
    """Atualizar calibração da IA - Permite aos Data Scientists ajustar a sensibilidade do Prophet/PyOD."""
    
    old_config = db_model_config.copy()
    db_model_config["prophet_uncertainty_interval"] = config.prophet_uncertainty_interval
    db_model_config["pyod_contamination_rate"] = config.pyod_contamination_rate
    
    logger.info(f"⚙️ Modelo recalibrado: Prophet {old_config['prophet_uncertainty_interval']}->{config.prophet_uncertainty_interval}, PyOD {old_config['pyod_contamination_rate']}->{config.pyod_contamination_rate}")
    
    return ModelConfig(**db_model_config)

# --- 5. Webhook Management Service ---
@app.get("/v1/webhooks", tags=["5. Webhook Management Service"], response_model=List[WebhookResponse])
async def list_webhooks(token: str = Depends(verify_token)):
    """Listar subscrições ativas - Mostra quem está a escutar os eventos de anomalia."""
    logger.debug(f"📡 Webhooks ativos consultados: {len(db_webhooks)}")
    return list(db_webhooks.values())

@app.post("/v1/webhooks", status_code=status.HTTP_201_CREATED, tags=["5. Webhook Management Service"], response_model=WebhookResponse)
async def create_webhook(webhook: WebhookSubscription, token: str = Depends(verify_token)):
    """Registar novo Webhook - Subscreve um serviço externo para receber callbacks automáticos."""
    
    webhook_id = f"webhook_{uuid.uuid4().hex[:8]}"
    
    webhook_data = WebhookResponse(
        webhook_id=webhook_id,
        target_url=webhook.target_url,
        event_type=webhook.event_type,
        status="active"
    )
    
    db_webhooks[webhook_id] = webhook_data
    
    logger.info(f"📡 Webhook registado: {webhook_id} -> {webhook.target_url} ({webhook.event_type})")
    
    return webhook_data