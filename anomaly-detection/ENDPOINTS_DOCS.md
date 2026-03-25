# VoltGuard Endpoints Reference

## Base
- Local default: `http://127.0.0.1:8013`
- Header (required except health): `X-App-Token`

---

## Measurements

### POST /v1/measurements
Ingest historical dataset in JSON and run train+analysis immediately.

### POST /v1/measurements/csv
Ingest historical dataset from CSV file (multipart).

### POST /v1/measurements/import
Ingest historical dataset by downloading CSV from URL.

### GET /v1/measurements
List all submitted measurements.
- Optional: `source_id`

### GET /v1/measurements/{measurement_id}
Get one measurement analysis metadata.

---

## Anomalies

### GET /v1/anomalies
List anomalies.
- Optional filters: `source_id`, `measurement_id`
- Pagination: `limit`, `offset`

### GET /v1/anomalies/{anomaly_id}
Get full anomaly detail.

---

## Models & Forecast

### GET /v1/models
List available models.

### GET /v1/models/{model_id}/config
Read config.

### PUT /v1/models/{model_id}/config
Update config.

### GET /v1/forecasts/{sensor_id}
Generate forecast from trained model.
- Optional query: `metric_name`, `periods`, `model_id`

---

## Webhooks

### GET /v1/webhooks
List webhooks.

### GET /v1/webhooks/{webhook_id}
Get webhook detail.

### POST /v1/webhooks
Create webhook.

### DELETE /v1/webhooks/{webhook_id}
Delete webhook.

---

## Health & Metrics

### GET /v1/health
Public health check.

### GET /v1/metrics
Operational counters and model config snapshot.

---

## Tokens

### POST /v1/auth/tokens
Create token.

### DELETE /v1/auth/tokens/{token_id}
Revoke token.

---

## Expected Workflow
1. Upload measurements (`/v1/measurements` or csv/import)
2. Read measurement result (`/v1/measurements/{id}`)
3. Query anomalies (`/v1/anomalies?...`)
4. Query forecast (`/v1/forecasts/{sensor_id}`)

