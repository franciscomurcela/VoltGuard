import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'oam'

// ─── Device Endpoints ────────────────────────────────────────────────────────

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
  const url = getServiceUrl('oam', '/sensors')
  const res = await client.post(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function updateDevice(req, id, deviceData) {
  const url = getServiceUrl('oam', `/sensors/${id}`)
  const res = await client.patch(url, deviceData, { headers: forwardHeaders(req) })
  return res.data
}

export async function deleteDevice(req, id) {
  const url = getServiceUrl('oam', `/sensors/${id}`)
  const res = await client.delete(url, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Sensor Actions ──────────────────────────────────────────────────────────

export async function scheduleFirmwareUpdate(req, id, firmwareId) {
  const url = getServiceUrl('oam', `/sensors/${id}/actions/update-firmware`)
  const res = await client.post(url, { firmware_id: firmwareId }, { headers: forwardHeaders(req) })
  return res.data
}

export async function scheduleReboot(req, id) {
  const url = getServiceUrl('oam', `/sensors/${id}/actions/reboot`)
  const res = await client.post(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

export async function clearAnomaly(req, id) {
  const url = getServiceUrl('oam', `/sensors/${id}/actions/clear-anomaly`)
  const res = await client.post(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

// ─── Firmware Endpoints ──────────────────────────────────────────────────────

export async function getAllFirmwares(req) {
  return withRetry(async () => {
    const url = getServiceUrl('oam', '/firmwares')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

/**
 * Upload firmware — streams multipart/form-data straight through to OAM.
 * We pipe the raw request instead of buffering so large .bin files don't
 * blow the compositor's memory limit.
 */
export async function uploadFirmware(req) {
  const url = getServiceUrl('oam', '/firmwares')
  const res = await client.post(url, req, {
    headers: {
      ...forwardHeaders(req),
      'content-type': req.headers['content-type'], // preserve multipart boundary
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return res.data
}

/**
 * Download firmware — returns the raw axios response so the route handler
 * can pipe the binary stream directly to the HTTP response.
 */
export async function downloadFirmware(req, id) {
  const url = getServiceUrl('oam', `/firmwares/download/${id}`)
  const res = await client.get(url, {
    headers: forwardHeaders(req),
    responseType: 'stream',
  })
  return res // caller pipes res.data
}

// ─── Metrics & Health ────────────────────────────────────────────────────────

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
