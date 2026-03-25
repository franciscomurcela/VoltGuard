# VoltGuard - Anomaly Detection Service

Serviço de deteção de anomalias temporal para o VoltGuard com pipeline **síncrona** (FastAPI + Prophet).

## Estado atual da arquitetura

Fluxo principal:

`Client -> FastAPI -> Prophet (treino + validação) -> Anomalies in-memory -> Forecasts`

- Processamento ocorre no próprio request de ingestão (`POST /v1/measurements`, `/csv`, `/import`).
- Anomalias e metadados ficam em memória durante a execução da API.
- Webhooks são opcionais e disparados nos eventos:
  - `anomaly_detected`
  - `measurement_processed`

## Estrutura do projeto (anomaly-detection)

- `app/main.py` - bootstrap da API e registo dos routers
- `app/routers/` - endpoints por domínio (measurements, anomalies, models, webhooks, auth, health)
- `app/pipeline.py` - lógica de pipeline Prophet
- `app/state.py` - estado in-memory da aplicação
- `app/schemas.py` - contratos Pydantic
- `app/deps.py` - dependências comuns (auth/token)
- `validate_pipeline.ps1` - validação end-to-end automática
- `requirements.txt` - dependências (inclui `pandas` e `prophet`)
- `docker-compose.yaml` - infra legada (não obrigatória para o fluxo atual)
- `API_DOCUMENTATION.md`, `ENDPOINTS_DOCS.md`, `api.yaml` - documentação auxiliar

## Pré-requisitos

- Windows + PowerShell
- Python 3.12 (recomendado para Prophet)
- Ambiente virtual `.venv312`

## Arranque rápido

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
- `http://127.0.0.1:8013/docs`

## Como validar tudo automaticamente

```powershell
cd C:\mestrado\1ano\2semestre\egs\VoltGuard\anomaly-detection
powershell -ExecutionPolicy Bypass -File .\validate_pipeline.ps1
```

## Inserção de datasets (3 modos)

### 1) JSON direto
- Endpoint: `POST /v1/measurements`
- Body: `source_id`, `metric_name`, `config`, `dataset[]`
- Cada item do `dataset`: `timestamp`, `value`

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

### 2) CSV upload local
- Endpoint: `POST /v1/measurements/csv`
- `multipart/form-data`
- Campos: `file`, `source_id`, `metric_name`, `train_ratio`, `temporal_mode`, `aggregation`, `timezone`

CSV mínimo esperado:
```csv
timestamp,value
2026-03-01T00:00:00Z,220.1
2026-03-01T01:00:00Z,221.3
```

### 3) Import CSV remoto por URL
- Endpoint: `POST /v1/measurements/import`
- Body base: `source_url`, `source_id`, `metric_name`, `config`
- Campos opcionais de parsing: `delimiter`, `timestamp_column`, `value_column`, `date_column`, `time_column`

## Como funciona o split 80/20

Após ordenar os pontos por timestamp:

- `split_idx = int(total_points * train_ratio)`
- Treino: primeiros `split_idx` pontos
- Validação/anomalias: pontos restantes

Com `train_ratio = 0.8` e `40` pontos:
- treino = `32`
- validação = `8`

A API devolve estes valores em:
- `rows_training`
- `rows_forecast`

## Pipeline principal (main pipeline)

1. Ingestão recebe dataset e normaliza config (`train_ratio`, granularidade, agregação)
2. Série temporal é limpa/convertida (`timestamp -> ds`, `value -> y`)
3. Aplica agregação temporal opcional (`hourly|daily|weekly|monthly` + `mean|sum|median`)
4. Divide em treino/validação com ratio configurável
5. Treina Prophet com treino
6. Compara validação com intervalo `[yhat_lower, yhat_upper]`
7. Ponto fora do intervalo vira anomalia
8. Guarda anomalias e metadados em memória
9. Dispara webhooks (se ativos)
10. Disponibiliza forecast por sensor/métrica

## Endpoints atuais

### 1. Ingestion & Measurements
- `POST /v1/measurements`
- `POST /v1/measurements/csv`
- `POST /v1/measurements/import`
- `GET /v1/measurements`
- `GET /v1/measurements/{measurement_id}`

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
- `GET /v1/health` (sem token)
- `GET /v1/metrics`

### 6. Token Management
- `POST /v1/auth/tokens`
- `DELETE /v1/auth/tokens/{token_id}`

## Como ver detalhes de cada anomalia

### Passo 1: listar anomalias
```powershell
$BASE = "http://127.0.0.1:8013"
$TOKEN = "token_do_composer_123"
$H = @{ "X-App-Token" = $TOKEN }

$anoms = Invoke-RestMethod -Uri "$BASE/v1/anomalies?limit=50&offset=0" -Headers $H
$anoms.items
```

### Passo 2: escolher ID e consultar detalhe
```powershell
$anomalyId = $anoms.items[0].anomaly_id
Invoke-RestMethod -Uri "$BASE/v1/anomalies/$anomalyId" -Headers $H | ConvertTo-Json -Depth 10
```

Campos relevantes no detalhe:
- `anomaly_id`
- `measurement_id`
- `source_id`
- `timestamp`
- `trigger_metrics` (inclui valor real e bounds)
- `detection_method`
- `confidence_score`
- `severity`
- `model_id`

## Autenticação

Todos os endpoints, exceto `GET /v1/health`, exigem:

```http
X-App-Token: token_do_composer_123
```

## Notas de operação

- `Importing plotly failed` no Prophet é informativo (não bloqueia pipeline).
- Webhook `404` acontece quando usas URL placeholder; para testar entrega real usa uma URL válida (ex: endpoint teu).
- Aviso de `FutureWarning` sobre frequência `'H'` não bloqueia execução; pode ser ajustado em melhoria futura.
