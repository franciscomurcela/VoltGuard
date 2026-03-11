"""
Configuração do Celery para Anomaly Detection Service
"""
from celery import Celery
import os

# URLs configuráveis via variáveis de ambiente (modularidade)
RABBITMQ_URL = os.getenv(
    "RABBITMQ_URL",
    "amqp://voltguard:voltguard123@localhost:5672//"
)

REDIS_URL = os.getenv(
    "REDIS_URL",
    "redis://localhost:6379/0"
)

# Criar aplicação Celery
celery_app = Celery(
    "anomaly_detection",
    broker=RABBITMQ_URL,      # Onde buscar jobs (RabbitMQ)
    backend=REDIS_URL,        # Onde guardar resultados (Redis)
    include=["worker"]        # Importar tasks do worker.py
)

# Configurações
celery_app.conf.update(
    # Serialização (JSON para compatibilidade)
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Resultados expiram em 1 hora
    result_expires=3600,
    
    # Confirmação tardia (só confirma após processar com sucesso)
    task_acks_late=True,
    
    # Se worker morrer, rejeita job (vai voltar para fila)
    task_reject_on_worker_lost=True,
)