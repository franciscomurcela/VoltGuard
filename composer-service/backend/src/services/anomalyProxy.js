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
 * POST /v1/measurements — submit sensor data for anomaly detection
 * Called by the compositor when it wants to trigger analysis.
 */
export async function submitMeasurements(req, measurementData) {
  const url = getServiceUrl("anomaly", "/v1/measurements");
  const res = await client.post(url, measurementData, {
    headers: anomalyHeaders(req),
  });
  return res.data;
}

/**
 * GET /v1/measurements/:id — check job status
 */
export async function getMeasurementStatus(req, measurementId) {
  return withRetry(
    async () => {
      const url = getServiceUrl("anomaly", `/v1/measurements/${measurementId}`);
      const res = await client.get(url, { headers: anomalyHeaders(req) });
      return res.data;
    },
    { label: LABEL },
  );
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
