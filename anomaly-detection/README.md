# VoltGuard - Anomaly Detection Service

Serviço de deteção de anomalias para o sistema VoltGuard. Processa medições de sensores de forma assíncrona usando Celery + RabbitMQ e deteta anomalias considerando variáveis contextuais.

## 🏗️ Arquitetura

```
Cliente → FastAPI → RabbitMQ → Celery Worker → Redis
                                      ↓
                                 Deteção ML
                                      ↓
                                  Anomalias
```

### Componentes:
- **FastAPI**: API REST com 11 endpoints
- **RabbitMQ**: Fila de mensagens para processamento assíncrono
- **Redis**: Armazenamento compartilhado de jobs e anomalias
- **Celery Worker**: Processamento assíncrono com deteção de anomalias
- **Docker Compose**: Orquestração de RabbitMQ e Redis

## 🚀 Tecnologias

- Python 3.13
- FastAPI 0.115.0
- Celery 5.4.0
- RabbitMQ 3.12
- Redis 7.2
- Pydantic 2.9.0

## 📋 Pré-requisitos

- Docker Desktop instalado e a correr
- Python 3.13+
- PowerShell (Windows)

## ⚙️ Instalação e Execução

### 1. Iniciar infraestrutura (RabbitMQ + Redis)
```powershell
cd C:\mestrado\1ano\2semestre\egs\VoltGuard\anomaly-detection
docker-compose up -d
```

Verificar containers:
```powershell
docker ps
```

### 2. Instalar dependências Python
```powershell
pip install -r requirements.txt
```

### 3. Iniciar API FastAPI
```powershell
uvicorn main:app --reload
```
API disponível em: http://127.0.0.1:8000  
Swagger UI: http://127.0.0.1:8000/docs

### 4. Iniciar Celery Worker (nova janela PowerShell)
```powershell
cd C:\mestrado\1ano\2semestre\egs\VoltGuard\anomaly-detection
celery -A worker worker --loglevel=info --pool=solo
```

### 5. RabbitMQ Management (opcional)
Interface web: http://localhost:15672  
User: `voltguard`  
Password: `voltguard123`

---

## 📡 Endpoints da API

### **Autenticação**
Todos os endpoints (exceto `/v1/health`) requerem header:
```
X-App-Token: token_do_composer_123
```

---

## 🔧 1. Ingestion Service

### POST `/v1/measurements`
**Descrição**: Recebe medições de sensores e cria jobs Celery para processamento assíncrono.

**Funcionamento**:
1. Agrupa medições por `source_id` (sensor)
2. Cria 1 job Celery por sensor
3. Envia jobs para fila RabbitMQ
4. Retorna `measurement_id` imediatamente (202 Accepted)

**Body**:
```json
{
  "data": [
    {
      "source_id": "sensor_01",
      "timestamp": "2024-03-10T14:30:00Z",
      "metrics": {
        "voltage": 220.5,
        "current": 15.2
      },
      "context": {
        "hour": 14,
        "day_of_week": 1,
        "num_users": 50,
        "temperature": 22.5,
        "location": "Building A"
      }
    }
  ]
}
```

**Teste PowerShell**:
```powershell
$body = @{
    data = @(
        @{
            source_id = "sensor_01"
            timestamp = "2024-03-10T14:30:00Z"
            metrics = @{
                voltage = 220.5
                current = 15.2
            }
            context = @{
                hour = 14
                day_of_week = 1
                num_users = 50
                temperature = 22.5
                location = "Building A"
            }
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/measurements" -Method POST -Body $body -ContentType "application/json" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "measurement_id": "meas_42f6abc1",
  "status": "raw"
}
```

---

## 📊 2. Job Tracking Service

### GET `/v1/measurements/{measurement_id}`
**Descrição**: Consulta o status de processamento de uma submissão.

**Status possíveis**:
- `raw`: Medição recebida, aguardando processamento ou em processamento
- `analyzed`: Processamento completo

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/measurements/meas_42f6abc1" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "measurement_id": "meas_42f6abc1",
  "status": "analyzed",
  "anomalies_detected": true
}
```

---

## 🚨 3. Anomaly Registry Service

### GET `/v1/anomalies`
**Descrição**: Lista todas as anomalias com paginação e filtros.

**Query Parameters**:
- `source_id` (opcional): Filtrar por sensor
- `limit` (default: 25): Número de resultados por página
- `offset` (default: 0): Offset para paginação

**Teste PowerShell**:
```powershell
# Listar todas
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/anomalies" -Headers @{"X-App-Token"="token_do_composer_123"}

# Filtrar por sensor
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/anomalies?source_id=sensor_01" -Headers @{"X-App-Token"="token_do_composer_123"}

# Paginação
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/anomalies?limit=10&offset=0" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "items": [
    {
      "anomaly_id": "ANM-20260310180518-6472",
      "source_id": "sensor_01",
      "timestamp": "2024-03-10T14:30:00Z",
      "severity": "CRITICAL"
    }
  ],
  "total": 5,
  "limit": 25,
  "offset": 0,
  "has_more": false
}
```

### GET `/v1/anomalies/{anomaly_id}`
**Descrição**: Detalhes completos de uma anomalia específica.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/anomalies/ANM-20260310180518-6472" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "anomaly_id": "ANM-20260310180518-6472",
  "source_id": "sensor_01",
  "timestamp": "2024-03-10T14:30:00Z",
  "trigger_metrics": {
    "voltage": 1500.0
  },
  "detection_method": "ContextualMockup",
  "confidence_score": 0.9
}
```

---

## 🤖 4. Model Management Service

### GET `/v1/models/config`
**Descrição**: Configuração atual dos modelos de ML.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/models/config" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "prophet_uncertainty_interval": 0.95,
  "pyod_contamination_rate": 0.05
}
```

### PUT `/v1/models/config`
**Descrição**: Atualiza configuração dos modelos.

**Body**:
```json
{
  "prophet_uncertainty_interval": 0.90,
  "pyod_contamination_rate": 0.03
}
```

**Teste PowerShell**:
```powershell
$config = @{
    prophet_uncertainty_interval = 0.90
    pyod_contamination_rate = 0.03
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/models/config" -Method PUT -Body $config -ContentType "application/json" -Headers @{"X-App-Token"="token_do_composer_123"}
```

---

## 🔔 5. Webhook Service

### POST `/v1/webhooks`
**Descrição**: Registar webhook para notificações automáticas.

**Body**:
```json
{
  "target_url": "https://example.com/webhook",
  "event_type": "anomaly_detected"
}
```

**Event types**:
- `anomaly_detected`: Notifica quando anomalia é detetada
- `measurement_processed`: Notifica quando medição é processada
- `all`: Todos os eventos

**Teste PowerShell**:
```powershell
$webhook = @{
    target_url = "https://webhook.site/unique-url"
    event_type = "anomaly_detected"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/webhooks" -Method POST -Body $webhook -ContentType "application/json" -Headers @{"X-App-Token"="token_do_composer_123"}
```

### GET `/v1/webhooks`
**Descrição**: Lista todos os webhooks registados.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/webhooks" -Headers @{"X-App-Token"="token_do_composer_123"}
```

### DELETE `/v1/webhooks/{webhook_id}`
**Descrição**: Remove um webhook.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/webhooks/webhook_abc123" -Method DELETE -Headers @{"X-App-Token"="token_do_composer_123"}
```

---

## 💚 6. Health & Metrics Service

### GET `/v1/health`
**Descrição**: Health check do serviço (não requer token).

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/health"
```

**Response**:
```json
{
  "status": "UP",
  "database": "CONNECTED"
}
```

### GET `/v1/metrics`
**Descrição**: Métricas internas do sistema.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/metrics" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "total_measurements": 10,
  "total_jobs": 15,
  "jobs_completed": 12,
  "jobs_pending": 2,
  "jobs_processing": 1,
  "jobs_failed": 0,
  "total_anomalies": 5,
  "active_webhooks": 2,
  "avg_processing_time_ms": 150.5,
  "model_config": { ... },
  "uptime_seconds": 0
}
```

---

## 🔑 7. Token Management Service

### POST `/v1/auth/tokens`
**Descrição**: Gera novo token de acesso.

**Body**:
```json
{
  "service_name": "OAM Service"
}
```

**Teste PowerShell**:
```powershell
$tokenReq = @{
    service_name = "OAM Service"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/auth/tokens" -Method POST -Body $tokenReq -ContentType "application/json" -Headers @{"X-App-Token"="token_do_composer_123"}
```

**Response**:
```json
{
  "token_id": "token_abc123",
  "token": "vg_9f8e7d6c5b4a3210",
  "service_name": "OAM Service",
  "created_at": "2024-03-10T18:30:00Z"
}
```

### DELETE `/v1/auth/tokens/{token_id}`
**Descrição**: Revoga um token.

**Teste PowerShell**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/auth/tokens/token_abc123" -Method DELETE -Headers @{"X-App-Token"="token_do_composer_123"}
```

---

## 🧪 Testes Completos

### Teste de Fluxo Completo
```powershell
# 1. Enviar medição com valor anômalo
$body = @{
    data = @(
        @{
            source_id = "sensor_test"
            timestamp = "2024-03-10T18:30:00Z"
            metrics = @{
                voltage = 2000.0
                current = 300.0
            }
            context = @{
                hour = 18
                day_of_week = 1
                num_users = 80
            }
        }
    )
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/measurements" -Method POST -Body $body -ContentType "application/json" -Headers @{"X-App-Token"="token_do_composer_123"}
$result

# 2. Aguardar processamento
Start-Sleep -Seconds 2

# 3. Verificar status
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/measurements/$($result.measurement_id)" -Headers @{"X-App-Token"="token_do_composer_123"}

# 4. Listar anomalias
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/anomalies" -Headers @{"X-App-Token"="token_do_composer_123"}

# 5. Ver métricas
Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/metrics" -Headers @{"X-App-Token"="token_do_composer_123"}
```

---

## 🔍 Deteção de Anomalias

### Lógica Atual (Mockup)
- **Base**: 30% probabilidade de deteção
- **Ajustes contextuais**:
  - Peak hours (9h-18h): -30% probabilidade
  - Fim de semana: -20% probabilidade
  - Muitos utilizadores (>100): -40% probabilidade
  - Valores extremos (>1000 ou <0): 90% probabilidade

### Níveis de Severidade
- **LOW**: |valor| ≤ 100
- **MEDIUM**: 100 < |valor| ≤ 500
- **HIGH**: 500 < |valor| ≤ 1000
- **CRITICAL**: |valor| > 1000

### Variáveis Contextuais
- `hour`: Hora do dia (0-23)
- `day_of_week`: Dia da semana (0=Segunda, 6=Domingo)
- `num_users`: Número de utilizadores ativos
- `temperature`: Temperatura ambiente (°C)
- `location`: Localização geográfica
- `custom_fields`: Campos personalizados

---

## 🌐 Variáveis de Ambiente

```bash
# RabbitMQ
RABBITMQ_URL=amqp://voltguard:voltguard123@localhost:5672//

# Redis
REDIS_URL=redis://localhost:6379/0
```

---

## 🐛 Troubleshooting

### Erro: "Docker engine não encontrado"
```powershell
# Iniciar Docker Desktop e aguardar até ícone ficar estável
```

### Erro: "Module 'celery' not found"
```powershell
pip install -r requirements.txt
```

### Worker não conecta ao RabbitMQ
```powershell
# Verificar se containers estão a correr
docker ps

# Ver logs do RabbitMQ
docker logs anomaly-detection-rabbitmq-1
```

### Anomalias não aparecem na API
```powershell
# Limpar Redis e reiniciar serviços
docker exec -it anomaly-detection-redis-1 redis-cli FLUSHALL
```

### Celery no Windows
  Usar sempre `--pool=solo`:
```powershell
celery -A worker worker --loglevel=info --pool=solo
```

---

## 📁 Estrutura do Projeto

```
anomaly-detection/
├── main.py              # FastAPI app com 11 endpoints
├── worker.py            # Celery worker com deteção de anomalias
├── celery_config.py     # Configuração Celery
├── requirements.txt     # Dependências Python
├── docker-compose.yaml  # RabbitMQ + Redis
├── api.yaml            # Especificação OpenAPI 3.0
└── README.md           # Este ficheiro
```

---

## 📚 Documentação Adicional

- **Swagger UI**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc
- **OpenAPI JSON**: http://127.0.0.1:8000/openapi.json

---

## 🚀 Próximos Passos

- [ ] Integrar Prophet para deteção temporal
- [ ] Integrar PyOD para deteção de outliers
- [ ] Adicionar MongoDB para persistência
- [ ] Implementar webhooks funcionais
- [ ] Dashboard de monitorização
- [ ] Testes unitários e integração
- [ ] CI/CD pipeline

---

## 👥 Autores

VoltGuard Team - EGS 2024/2026
