import logger from './logger.js'

// ─── Service Registry ───────────────────────────────────────────────────────
// In Kubernetes, services are resolved via internal DNS:
//   http://<service-name>.<namespace>.svc.cluster.local:<port>
// For simplicity, we use env vars that K8s manifests populate.

const services = {
  oam: {
    name: 'OAM Service',
    baseUrl: process.env.OAM_SERVICE_URL || 'http://localhost:8081',
    healthPath: '/api/health',
  },
  notification: {
    name: 'Notification Service',
    baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8082',
    healthPath: '/api/health',
  },
  anomaly: {
    name: 'Anomaly Detection',
    baseUrl: process.env.ANOMALY_SERVICE_URL || 'http://localhost:8083',
    healthPath: '/api/health',
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
