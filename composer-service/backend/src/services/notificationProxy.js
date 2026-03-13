import client, { forwardHeaders, withRetry } from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import config from '../config/services.js'
import logger from '../utils/logger.js'

const LABEL = 'notification'

// Auth token for the notification service (query param, not Bearer)
const AUTH_TOKEN = process.env.NOTIFICATIONS_AUTH_TOKEN || 'your_secure_auth_token'
const CLIENT_ID = process.env.COMPOSITOR_CLIENT_ID || 'energy_composer'

// ─── Notification Endpoints ─────────────────────────────────────────────────
// Real API: /v1/notifications with ?auth_token=...&client_id=...

export async function getNotifications(req, params = {}) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', '/v1/notifications')
    const res = await client.get(url, {
      headers: forwardHeaders(req),
      params: {
        auth_token: AUTH_TOKEN,
        client_id: CLIENT_ID,
        limit: params.limit || 20,
        offset: params.offset || 0,
      },
    })
    return res.data
  }, { label: LABEL })
}

export async function getNotificationById(req, notificationId) {
  return withRetry(async () => {
    const url = getServiceUrl('notification', `/v1/notifications/${notificationId}`)
    const res = await client.get(url, {
      headers: forwardHeaders(req),
      params: { auth_token: AUTH_TOKEN },
    })
    return res.data
  }, { label: LABEL })
}

export async function sendNotification(req, notificationData) {
  const url = getServiceUrl('notification', '/v1/notifications')
  const res = await client.post(url, notificationData, {
    headers: forwardHeaders(req),
    params: { auth_token: AUTH_TOKEN },
  })
  return res.data
}

export async function getNotificationHealth() {
  try {
    const url = getServiceUrl('notification', '/health')
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
