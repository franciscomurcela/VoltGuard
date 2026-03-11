import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'notification'

// ─── Notification Endpoints ─────────────────────────────────────────────────

export async function getNotifications(req, params = {}) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', '/api/notifications')
    const res = await client.get(url, {
      headers: forwardHeaders(req),
      params: {
        limit: params.limit || 20,
        since: params.since || undefined,
        type: params.type || undefined,
      },
    })
    return res.data
  }, { label: LABEL })
}

export async function getNotificationCount(req) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', '/api/notifications/count')
    const res = await client.get(url, { headers: forwardHeaders(req) })
    return res.data
  }, { label: LABEL })
}

export async function markAsRead(req, notificationId) {
  const url = getServiceUrl('notification', `/api/notifications/${notificationId}/read`)
  const res = await client.put(url, {}, { headers: forwardHeaders(req) })
  return res.data
}

export async function getNotificationHealth() {
  try {
    const url = getServiceUrl('notification', '/api/health')
    const start = Date.now()
    const res = await client.get(url, { timeout: 3000 })
    const latency = Date.now() - start
    return { status: 'healthy', latency, details: res.data }
  } catch (err) {
    const latency = err.code === 'ECONNABORTED' ? config.proxy.timeout : null
    logger.warn({ err: err.message }, 'Notification health check failed')
    return { status: 'down', latency, error: err.message }
  }
}
