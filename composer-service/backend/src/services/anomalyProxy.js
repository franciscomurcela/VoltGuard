import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'anomaly'

// ─── Anomaly Endpoints ──────────────────────────────────────────────────────

export async function getAnomalies(req, params = {}) {
  return withRetry(async () => {
    const url = getServiceUrl('anomaly', '/api/anomalies')
    const res = await client.get(url, {
      headers: forwardHeaders(req),
      params: {
        limit: params.limit || 50,
        severity: params.severity || undefined,
        deviceId: params.deviceId || undefined,
        since: params.since || undefined,
      },
    })
    return res.data
  }, { label: LABEL })
}

export async function getAnomalySummary(req) {
  return withRetry(async () => {
    const url = getServiceUrl('anomaly', '/api/anomalies/summary')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getAnomalyById(req, anomalyId) {
  return withRetry(async () => {
    const url = getServiceUrl('anomaly', `/api/anomalies/${anomalyId}`)
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function acknowledgeAnomaly(req, anomalyId) {
  const url = getServiceUrl('anomaly', `/api/anomalies/${anomalyId}/acknowledge`)
  const res = await client.put(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

export async function getAnomalyHealth() {
  try {
    const url = getServiceUrl('anomaly', '/api/health')
    const start = Date.now()
    const res = await client.get(url, { timeout: 3000 })
    const latency = Date.now() - start
    const serviceStatus = res.data?.status || 'healthy'
    return { status: serviceStatus, latency, details: res.data }
  } catch (err) {
    const latency = err.code === 'ECONNABORTED' ? config.proxy.timeout : null
    logger.warn({ err: err.message }, 'Anomaly health check failed')
    return { status: 'down', latency, error: err.message }
  }
}
