import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'oam'

// ─── Device Endpoints (OAM owns device registry as "sensors") ───────────────

export async function getAllDevices(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/sensors')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getDeviceById(req, id) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', `/sensors/${id}`)
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function createDevice(req, deviceData) {
  // No retry on writes — idempotency not guaranteed
  const url = getServiceUrl('oam', '/sensors')
  const res = await client.post(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function updateDevice(req, id, deviceData) {
  // OAM uses PATCH, not PUT
  const url = getServiceUrl('oam', `/sensors/${id}`)
  const res = await client.patch(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function deleteDevice(req, id) {
  const url = getServiceUrl('oam', `/sensors/${id}`)
  const res = await client.delete(url, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Metrics & District Stats ───────────────────────────────────────────────
// Both /api/metrics and /api/districts/stats map to the same OAM endpoint

export async function getMetrics(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/sensors/stats')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function getDistrictStats(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/sensors/stats')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

// ─── Sensor Actions (each action has its own endpoint) ──────────────────────

export async function rebootSensor(req, sensorId) {
  const url = getServiceUrl('oam', `/sensors/${sensorId}/actions/reboot`)
  const res = await client.post(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

export async function clearAnomalySensor(req, sensorId) {
  const url = getServiceUrl('oam', `/sensors/${sensorId}/actions/clear-anomaly`)
  const res = await client.post(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

export async function updateFirmwareSensor(req, sensorId, firmwareId) {
  const url = getServiceUrl('oam', `/sensors/${sensorId}/actions/update-firmware`)
  const res = await client.post(url, { firmware_id: firmwareId }, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Anomaly Reporting (sensor reports an anomaly to OAM) ───────────────────

export async function reportAnomaly(req, sensorId, anomalyData) {
  const url = getServiceUrl('oam', `/sensors/${sensorId}/anomalies`)
  const res = await client.post(url, anomalyData, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Keepalive (sensor heartbeat + pending action delivery) ─────────────────

export async function sendKeepalive(req, sensorId, keepaliveData) {
  const url = getServiceUrl('oam', `/sensors/${sensorId}/keepalive`)
  const res = await client.post(url, keepaliveData || {}, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Firmware Management ────────────────────────────────────────────────────

export async function getAllFirmwares(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/firmwares')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function uploadFirmware(req, formData) {
  const url = getServiceUrl('oam', '/firmwares')
  const res = await client.post(url, formData, {
    headers: {
      ...forwardHeaders(req),
      ...formData.getHeaders?.() || { 'Content-Type': 'multipart/form-data' },
    },
    maxBodyLength: Infinity,
  })
  return res.data
}

export async function getFirmwareDownloadUrl(firmwareId) {
  // OAM path is /firmwares/download/{id} (not /firmwares/{id}/download)
  return getServiceUrl('oam', `/firmwares/download/${firmwareId}`)
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function getOamHealth() {
  try {
    const url = getServiceUrl('oam', '/health')
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
