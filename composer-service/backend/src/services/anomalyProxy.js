import client, { forwardHeaders, withRetry } from "../utils/proxyClient.js";
import { getServiceUrl } from "../utils/serviceDiscovery.js";
import config from "../config/services.js";
import logger from "../utils/logger.js";

const LABEL = "anomaly";

// Anomaly service uses X-App-Token header, not Bearer
const APP_TOKEN = process.env.ANOMALY_APP_TOKEN || "token_do_composer_123";

/**
 * Build headers for the anomaly service.
 * Forwards correlation ID but uses X-App-Token instead of Bearer.
 */
function anomalyHeaders(req) {
  const headers = forwardHeaders(req);
  // Replace Bearer auth with X-App-Token
  delete headers.Authorization;
  headers["X-App-Token"] = APP_TOKEN;
  return headers;
}

// ─── Anomaly Endpoints ──────────────────────────────────────────────────────

/**
 * GET /v1/anomalies — paginated list, optionally filtered by source_id
 */
export async function getAnomalies(req, params = {}) {
  return withRetry(
    async () => {
      const url = getServiceUrl("anomaly", "/v1/anomalies");
      const res = await client.get(url, {
        headers: anomalyHeaders(req),
        params: {
          limit: params.limit || 25,
          offset: params.offset || 0,
          source_id: params.sourceId || undefined,
        },
      });
      return res.data;
    },
    { label: LABEL },
  );
}

/**
 * GET /v1/anomalies/:id — single anomaly detail
 */
export async function getAnomalyById(req, anomalyId) {
  return withRetry(
    async () => {
      const url = getServiceUrl("anomaly", `/v1/anomalies/${anomalyId}`);
      const res = await client.get(url, { headers: anomalyHeaders(req) });
      return res.data;
    },
    { label: LABEL },
  );
}

/**
 * GET /v1/metrics — internal API metrics (jobs, anomalies count, etc.)
 * Used by the compositor dashboard to show anomaly summary stats.
 */
export async function getAnomalySummary(req) {
  return withRetry(
    async () => {
      const url = getServiceUrl("anomaly", "/v1/metrics");
      const res = await client.get(url, { headers: anomalyHeaders(req) });
      return res.data;
    },
    { label: LABEL },
  );
}

/**
 * POST /v1/measurements — submit sensor data (JSON) for anomaly detection
 */
export async function submitMeasurements(req, measurementData) {
  const url = getServiceUrl('anomaly', '/v1/measurements')
  const res = await client.post(url, measurementData, { headers: anomalyHeaders(req) })
  return res.data
}

/**
 * POST /v1/measurements/csv — forward a CSV multipart upload
 * @param {import('form-data')} formData - pre-built FormData with file + fields
 */
export async function submitMeasurementsCsv(req, formData) {
  const url = getServiceUrl('anomaly', '/v1/measurements/csv')
  const headers = { ...anomalyHeaders(req), ...formData.getHeaders() }
  const res = await client.post(url, formData, { headers, maxBodyLength: Infinity })
  return res.data
}

/**
 * POST /v1/measurements/import — import measurements from a remote CSV URL
 */
export async function importMeasurements(req, body) {
  const url = getServiceUrl('anomaly', '/v1/measurements/import')
  const res = await client.post(url, body, { headers: anomalyHeaders(req) })
  return res.data
}

/**
 * GET /v1/measurements — list all measurements, optionally filtered by source_id
 */
export async function listMeasurements(req, sourceId) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', '/v1/measurements')
      const res = await client.get(url, {
        headers: anomalyHeaders(req),
        params: sourceId ? { source_id: sourceId } : undefined,
      })
      return res.data
    },
    { label: LABEL },
  )
}

/**
 * GET /v1/measurements/:id — single measurement metadata
 */
export async function getMeasurementById(req, measurementId) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', `/v1/measurements/${measurementId}`)
      const res = await client.get(url, { headers: anomalyHeaders(req) })
      return res.data
    },
    { label: LABEL },
  )
}

/**
 * GET /v1/measurements/status — periodic ingestion status
 */
export async function getIngestionStatus(req) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', '/v1/measurements/status')
      const res = await client.get(url, { headers: anomalyHeaders(req) })
      return res.data
    },
    { label: LABEL },
  )
}

/**
 * PUT /v1/measurements/config — update periodic ingestion configuration
 */
export async function updateIngestionConfig(req, body) {
  const url = getServiceUrl('anomaly', '/v1/measurements/config')
  const res = await client.put(url, body, { headers: anomalyHeaders(req) })
  return res.data
}

/**
 * GET /v1/models — list available AI models
 */
export async function listModels(req) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', '/v1/models')
      const res = await client.get(url, { headers: anomalyHeaders(req) })
      return res.data
    },
    { label: LABEL },
  )
}

/**
 * GET /v1/forecasts/:sensorId — forecast future values for a sensor
 */
export async function getForecast(req, sensorId, params = {}) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', `/v1/forecasts/${sensorId}`)
      const res = await client.get(url, {
        headers: anomalyHeaders(req),
        params: {
          periods:     params.periods     || 24,
          metric_name: params.metricName  || 'voltage',
          model_id:    params.modelId     || 'model_prophet_v1',
        },
      })
      return res.data
    },
    { label: LABEL },
  )
}

// The anomaly service currently ships a single model. The ID is the path
// parameter required by GET/PUT /v1/models/{model_id}/config.
const DEFAULT_MODEL_ID = process.env.ANOMALY_DEFAULT_MODEL_ID || 'model_prophet_v1'

/**
 * GET /v1/models/{model_id}/config
 */
export async function getModelConfig(req) {
  return withRetry(
    async () => {
      const url = getServiceUrl('anomaly', `/v1/models/${DEFAULT_MODEL_ID}/config`)
      const res = await client.get(url, { headers: anomalyHeaders(req) })
      return res.data
    },
    { label: LABEL },
  )
}

/**
 * PUT /v1/models/{model_id}/config
 * The anomaly service validates that body.model_id === path model_id,
 * so we always inject it here before forwarding.
 */
export async function updateModelConfig(req, configBody) {
  const url = getServiceUrl('anomaly', `/v1/models/${DEFAULT_MODEL_ID}/config`)
  const payload = { ...configBody, model_id: DEFAULT_MODEL_ID }
  const res = await client.put(url, payload, { headers: anomalyHeaders(req) })
  return res.data
}

/**
 * GET /v1/health — public, no token needed
 */
export async function getAnomalyHealth() {
  try {
    const url = getServiceUrl("anomaly", "/v1/health");
    const start = Date.now();
    const res = await client.get(url, { timeout: 3000 });
    const latency = Date.now() - start;
    // Anomaly returns { status: "UP", database: "CONNECTED" }
    const isHealthy = res.data?.status === "UP";
    return {
      status: isHealthy ? "healthy" : "degraded",
      latency,
      details: res.data,
    };
  } catch (err) {
    const latency = err.code === "ECONNABORTED" ? config.proxy.timeout : null;
    logger.warn({ err: err.message }, "Anomaly health check failed");
    return { status: "down", latency, error: err.message };
  }
}
