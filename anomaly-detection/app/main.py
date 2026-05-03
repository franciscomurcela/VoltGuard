from fastapi import FastAPI
import logging

from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.measurements import router as measurements_router
from app.routers.anomalies import router as anomalies_router
from app.routers.models import router as models_router
from app.routers.webhooks import router as webhooks_router
from app.state import init_persistence
from app.routers.ingestion import router as ingestion_router
from app.ingestion import periodic_ingestion_service
from .vault_loader import load_vault_secrets


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("voltguard-api")

openapi_tags = [
    {
        "name": "1. Ingestion & Measurements",
        "description": "Ingestão de medições históricas por sensor para treino/análise com Prophet.",
    },
    {
        "name": "2. Anomaly Registry",
        "description": "Consulta paginada do histórico e detalhes de anomalias.",
    },
    {
        "name": "3. Model Management",
        "description": "Configuração e calibração dos motores de IA (Prophet/PyOD) e previsões futuras.",
    },
    {
        "name": "4. Webhook Management",
        "description": "Gestão de subscrições para notificações assíncronas (Callbacks).",
    },
    {
        "name": "5. Health & Metrics",
        "description": "Monitorização do estado vital e métricas internas da própria API.",
    },
    {
        "name": "6. Token Management",
        "description": "Camada de segurança e governança de acessos à API.",
    },
]

load_vault_secrets()

app = FastAPI(
    title="VoltGuard - Anomalies Detection API",
    description="Plataforma Enterprise de observabilidade assíncrona. Ingestão massiva de telemetria, análise matemática via Machine Learning e gestão de governança da API.",
    version="3.0.0",
    openapi_tags=openapi_tags,
)


@app.on_event("startup")
async def startup_event():
    init_persistence()
    periodic_ingestion_service.start()
    logger.info("🚀 VoltGuard API iniciando...")
    logger.info("ℹ️ Sistema iniciado")
    logger.info("✅ Sistema pronto para receber requisições")


@app.on_event("shutdown")
async def shutdown_event():
    await periodic_ingestion_service.stop()


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(ingestion_router)
app.include_router(measurements_router)
app.include_router(anomalies_router)
app.include_router(models_router)
app.include_router(webhooks_router)
