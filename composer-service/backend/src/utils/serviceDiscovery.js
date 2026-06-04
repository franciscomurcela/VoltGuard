import logger from './logger.js'

// ─── Service Registry ───────────────────────────────────────────────────────
// Each peer service URL comes from an env var so the same image runs in any
// environment (docker-compose, staging, prod). Defaults point at the dev
// override ports so the backend works when launched outside its container.

const services = {
  oam: {
    name: 'OAM Service',
    baseUrl: process.env.OAM_SERVICE_URL || 'http://localhost:8084',
    healthPath: '/health',
  },
  notification: {
    name: 'Notification Service',
    baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8083',
    healthPath: '/health',
  },
  anomaly: {
    name: 'Anomaly Detection',
    baseUrl: process.env.ANOMALY_SERVICE_URL || 'http://localhost:8085',
    healthPath: '/v1/health',
  },
}

/**
 * Get the full URL for a peer service endpoint.
 * @param {'oam'|'notification'|'anomaly'} serviceKey
 * @param {string} path - API path, e.g. '/api/devices'
 * @returns {string} Full URL
 */
export function getServiceUrl(serviceKey, path = '') {
  const svc = services[serviceKey]
  if (!svc) {
    logger.error({ serviceKey }, 'Unknown service key requested')
    throw new Error(`Unknown service: ${serviceKey}`)
  }
  return `${svc.baseUrl}${path}`
}

/**
 * Get all registered services (for health aggregation).
 */
export function getAllServices() {
  return { ...services }
}

/**
 * Get a single service config.
 */
export function getService(key) {
  return services[key] || null
}

export default services
