# VoltGuard - Anomaly Detection Service

Serviço de deteção de anomalias temporal do VoltGuard com pipeline **síncrona** baseada em **FastAPI + Prophet**.

## Arquitetura atual

Fluxo principal:

`Client -> FastAPI -> Prophet (treino + validação) -> Anomalias/Forecasts`

- O processamento é feito no próprio request de ingestão.
- Não existe Celery/RabbitMQ/Redis no fluxo atual.
- Persistência MongoDB é opcional; sem Mongo, a API funciona em memória.
- Webhooks são opcionais (`anomaly_detected`, `measurement_processed`, `all`).

## Estrutura relevante

- `app/main.py` - bootstrap da API e registo de routers
- `app/routers/` - endpoints por domínio
- `app/pipeline.py` - treino Prophet, forecast e deteção de anomalias
- `app/ingestion.py` - ingestão periódica por datasets/composer
- `app/state.py` - estado em memória + persistência opcional
- `app/schemas.py` - contratos Pydantic
- `app/deps.py` - autenticação por token
- `validate_pipeline.ps1` - validação end-to-end
- `requirements.txt` - dependências

## Pré-requisitos

- Windows + PowerShell
- Python 3.12 (recomendado)
- ambiente virtual `.venv312`

## Arranque local (venv)

```powershell
cd C:\mestrado\1ano\2semestre\egs\VoltGuard\anomaly-detection

# criar venv (se ainda não existir)
py -3.12 -m venv .venv312

# instalar dependências
.\.venv312\Scripts\python.exe -m pip install --upgrade pip
.\.venv312\Scripts\python.exe -m pip install -r requirements.txt

# arrancar API
.\.venv312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8013 --reload --log-level debug
```

Swagger:
- `http://127.0.0.1:8085/docs`

## Arranque por Docker (apenas API)

Na raiz do monorepo (`VoltGuard`):

```powershell
docker compose up -d anomaly-api
docker compose logs -f anomaly-api
```

Health check:
- `http://localhost:8085/v1/health`

## Validação automática

```powershell
cd C:\mestrado\1ano\2semestre\egs\VoltGuard\anomaly-detection
powershell -ExecutionPolicy Bypass -File .\validate_pipeline.ps1
```

## Ingestão de datasets

No fluxo acordado com o Composer, a ingestão continua por datasets, mas os datasets podem ser fornecidos pelo Composer via POST.

Configuração recomendada no `.env`:

- `VG_INGESTION_MODE=datasets`
- `VG_COMPOSER_BASE_URL=http://127.0.0.1:8000`
- `VG_COMPOSER_DATASETS_POST_PATH=/v1/anomalies/datasets/push`
- `VG_COMPOSER_TIMEOUT_SECONDS=20`
- `VG_COMPOSER_TOKEN=` (se necessário)

Se o endpoint de POST do Composer não estiver disponível, a API usa fallback para as URLs de dataset configuradas em `VG_DATASET_1_URL`/`VG_DATASET_2_URL`.

### 1) JSON direto
- Endpoint: `POST /v1/measurements`
- Body: `source_id`, `metric_name`, `config`, `dataset[]`
- Cada item de `dataset`: `timestamp`, `value`

Exemplo:

```json
{
  "source_id": "sensor_01",
  "metric_name": "voltage",
  "config": {
    "train_ratio": 0.8,
    "temporal_mode": "hourly",
    "aggregation": "none",
    "timezone": "UTC"
  },
  "dataset": [
    { "timestamp": "2026-03-01T00:00:00Z", "value": 220.1 },
    { "timestamp": "2026-03-01T01:00:00Z", "value": 221.3 }
  ]
}
```

### 2) Upload CSV local
- Endpoint: `POST /v1/measurements/csv`
- `multipart/form-data`
- Campos: `file`, `source_id`, `metric_name`, `train_ratio`, `temporal_mode`, `aggregation`, `timezone`

CSV mínimo:

```csv
timestamp,value
2026-03-01T00:00:00Z,220.1
2026-03-01T01:00:00Z,221.3
```

### 3) Import CSV remoto (URL)
- Endpoint: `POST /v1/measurements/import`
- Body base: `source_url`, `source_id`, `metric_name`, `config`
- Campos opcionais de parsing: `delimiter`, `timestamp_column`, `value_column`, `date_column`, `time_column`

## Split treino/forecast (80/20)

Após ordenar os pontos por timestamp:

- `split_idx = int(total_points * train_ratio)`
- treino = primeiros `split_idx`
- forecast/validação = restantes

Com `train_ratio=0.8` e `40` pontos:

- `rows_training = 32`
- `rows_forecast = 8`

## Endpoints atuais

### 1. Ingestion & Measurements
- `POST /v1/measurements`
- `POST /v1/measurements/csv`
- `POST /v1/measurements/import`
- `GET /v1/measurements`
- `GET /v1/measurements/{measurement_id}`
- `GET /v1/measurements/status`
- `PUT /v1/measurements/config`

### 2. Anomaly Registry
- `GET /v1/anomalies`
- `GET /v1/anomalies/{anomaly_id}`

### 3. Model Management
- `GET /v1/models`
- `GET /v1/models/{model_id}/config`
- `PUT /v1/models/{model_id}/config`
- `GET /v1/forecasts/{sensor_id}`

### 4. Webhook Management
- `GET /v1/webhooks`
- `GET /v1/webhooks/{webhook_id}`
- `POST /v1/webhooks`
- `DELETE /v1/webhooks/{webhook_id}`

### 5. Health & Metrics
- `GET /v1/health` (público)
- `GET /v1/metrics`

### 6. Token Management
- `POST /v1/auth/tokens`
- `DELETE /v1/auth/tokens/{token_id}`

## Autenticação

Todos os endpoints (exceto `GET /v1/health`) exigem:

```http
X-App-Token: token_do_composer_123
```

Tokens default em `.env`:

- `VG_APP_TOKEN=token_do_composer_123`
- `VG_ADMIN_TOKEN=token_admin_999`

## Exemplo rápido (PowerShell)

```powershell
$BASE = "http://127.0.0.1:8013"
$H = @{ "X-App-Token" = "token_do_composer_123" }

$anoms = Invoke-RestMethod -Uri "$BASE/v1/anomalies?limit=20&offset=0" -Headers $H
$anoms.items
```

## Notas operacionais

- Mensagem `Importing plotly failed` no Prophet é informativa (não bloqueia o pipeline).
- Para enviar eventos para o Composer por default, usa `VG_COMPOSER_WEBHOOK_URL` (ou `VG_COMPOSER_WEBHOOK_PATH`).
- `VG_MONGO_URI` vazio mantém a API funcional em memória.
