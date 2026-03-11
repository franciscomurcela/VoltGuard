import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'oam'

// ─── Device Endpoints (OAM owns device registry) ────────────────────────────

export async function getAllDevices(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/api/devices')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getDeviceById(req, id) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', `/api/devices/${id}`)
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function createDevice(req, deviceData) {
  // No retry on writes — idempotency not guaranteed
  const url = getServiceUrl('oam', '/api/devices')
  const res = await client.post(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function updateDevice(req, id, deviceData) {
  const url = getServiceUrl('oam', `/api/devices/${id}`)
  const res = await client.put(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function deleteDevice(req, id) {
  const url = getServiceUrl('oam', `/api/devices/${id}`)
  const res = await client.delete(url, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Metrics & Config ───────────────────────────────────────────────────────

export async function getMetrics(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/api/metrics')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getDistrictStats(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/api/districts/stats')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getOamHealth() {
  try {
    const url = getServiceUrl('oam', '/api/health')
    const start = Date.now()
    const res = await client.get(url, { timeout: 3000 })
    const latency = Date.now() - start
    return { status: 'healthy', latency, details: res.data }
  } catch (err) {
    const latency = err.code === 'ECONNABORTED' ? config.proxy.timeout : null
    logger.warn({ err: err.message }, 'OAM health check failed')
    return { status: 'down', latency, error: err.message }
  }
}
