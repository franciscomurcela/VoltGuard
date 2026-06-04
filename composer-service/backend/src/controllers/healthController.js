import { getOamHealth } from '../services/oamProxy.js'
import { getNotificationHealth } from '../services/notificationProxy.js'
import { getAnomalyHealth } from '../services/anomalyProxy.js'
import logger from '../utils/logger.js'

// ─── Health Cache ────────────────────────────────────────────────────────────
// Readiness probes fire every 10s. Without caching, that's 3 upstream health
// calls every 10s just for probes. Cache results for 5s.
let healthCache = null
let healthCacheTime = 0
const HEALTH_CACHE_TTL = 5000

async function getAggregatedHealth() {
  const now = Date.now()
  if (healthCache && (now - healthCacheTime) < HEALTH_CACHE_TTL) {
    return healthCache
  }
  const [oam, notification, anomaly] = await Promise.all([
    getOamHealth(),
    getNotificationHealth(),
    getAnomalyHealth(),
  ])
  healthCache = { oam, notification, anomaly }
  healthCacheTime = now
  return healthCache
}

/**
 * GET /api/health
 * Always returns HTTP 200. The composite status is in the response body.
 * 503 was causing the frontend to crash — degraded peers are not a fatal
 * error for the compositor itself, so we communicate status in the payload.
 */
export async function check(req, res) {
  try {
    const start = Date.now()
    const { oam, notification, anomaly } = await getAggregatedHealth()
    const selfLatency = Date.now() - start

    const peerStatuses = [oam.status, notification.status, anomaly.status]
    let compositeStatus = 'healthy'
    if (peerStatuses.includes('down')) compositeStatus = 'degraded'
    if (peerStatuses.every((s) => s === 'down')) compositeStatus = 'down'

    res.status(200).json({
      status: compositeStatus,
      compositor: {
        status: 'healthy',
        latency: selfLatency,
        uptime: Math.floor(process.uptime()),
        memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      oam,
      notification,
      anomaly,
      _timestamp: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err: err.message }, 'Health check failed unexpectedly')
    // Still 200 — the compositor is alive, it just couldn't reach peers
    res.status(200).json({
      status: 'degraded',
      compositor: { status: 'healthy' },
      oam:          { status: 'unknown' },
      notification: { status: 'unknown' },
      anomaly:      { status: 'unknown' },
      _timestamp: new Date().toISOString(),
    })
  }
}

/**
 * GET /api/health/live
 * Lightweight liveness probe — just checks the process is alive.
 */
export async function liveness(req, res) {
  res.status(200).json({ status: 'alive' })
}

/**
 * GET /api/health/ready
 * Readiness probe — uses cached health so we don't hammer peers.
 * Keeps 503 behaviour since this is used by health probes, not the frontend.
 */
export async function readiness(req, res) {
  try {
    const { oam, notification, anomaly } = await getAggregatedHealth()
    const anyHealthy = [oam, notification, anomaly].some((s) => s.status === 'healthy')
    if (anyHealthy) {
      res.status(200).json({ status: 'ready' })
    } else {
      res.status(503).json({ status: 'not ready', reason: 'No peer services reachable' })
    }
  } catch (err) {
    res.status(503).json({ status: 'not ready', reason: 'Health check error' })
  }
}
