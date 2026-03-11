import * as oam from '../services/oamProxy.js'
import * as anomaly from '../services/anomalyProxy.js'
import logger from '../utils/logger.js'

/**
 * GET /api/metrics
 * Aggregates metrics from OAM (operational data) and Anomaly (detection stats).
 * Returns a unified payload the frontend Dashboard expects.
 */
export async function getSummary(req, res, next) {
  try {
    // Fetch from both services in parallel.
    // Use Promise.allSettled so a single service failure doesn't break the whole response.
    const [oamResult, anomalyResult] = await Promise.allSettled([
      oam.getMetrics(req),
      anomaly.getAnomalySummary(req),
    ])

    const oamData = oamResult.status === 'fulfilled' ? oamResult.value : null
    const anomalyData = anomalyResult.status === 'fulfilled' ? anomalyResult.value : null

    if (oamResult.status === 'rejected') {
      logger.warn({ err: oamResult.reason?.message }, 'OAM metrics fetch failed — using fallback')
    }
    if (anomalyResult.status === 'rejected') {
      logger.warn({ err: anomalyResult.reason?.message }, 'Anomaly summary fetch failed — using fallback')
    }

    // Compose the unified response.
    // Field names match what the frontend useMetrics hook expects.
    const metrics = {
      // From OAM
      totalRequests: oamData?.totalRequests ?? 0,
      requestsPerSecond: oamData?.requestsPerSecond ?? 0,
      totalDeployments: oamData?.totalDeployments ?? 0,
      firewallActions: oamData?.firewallActions ?? {
        total: 0, systemBlocks: 0, systemChallenges: 0, customWafBlocks: 0,
      },
      botManagement: oamData?.botManagement ?? { botsBlocked: 0, humansVerified: 0 },
      aiGateway: oamData?.aiGateway ?? { requests: 0, avgLatency: 0 },
      cache: oamData?.cache ?? { hitsServed: 0, hitRate: 0 },
      devicesOnline: oamData?.devicesOnline ?? 0,
      devicesTotal: oamData?.devicesTotal ?? 0,

      // From Anomaly
      anomalySummary: anomalyData ?? { total: 0, bySeverity: {}, trending: [] },

      // Metadata
      _sources: {
        oam: oamResult.status === 'fulfilled' ? 'ok' : 'unavailable',
        anomaly: anomalyResult.status === 'fulfilled' ? 'ok' : 'unavailable',
      },
      _timestamp: new Date().toISOString(),
    }

    res.json(metrics)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/districts/stats
 * Proxied from OAM — per-district request counts and rates.
 */
export async function getDistrictStats(req, res, next) {
  try {
    const data = await oam.getDistrictStats(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}
