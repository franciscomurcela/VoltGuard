import * as oam from '../services/oamProxy.js'
import * as anomaly from '../services/anomalyProxy.js'
import logger from '../utils/logger.js'

// ─── Response Cache ───────────────────────────────────────────────────────────
// OAM is the bottleneck — cache its response for 4s so that rapid frontend
// polling + simulator keepalives don't pile up DB queries simultaneously.
// The frontend polls every 5s so this still delivers fresh data each cycle.
let summaryCache     = null
let summaryCacheTime = 0
const SUMMARY_TTL    = 4000 // ms

let districtCache     = null
let districtCacheTime = 0
const DISTRICT_TTL    = 8000 // district counts change less frequently

/**
 * GET /api/metrics
 * Aggregates metrics from OAM (operational data) and Anomaly (detection stats).
 */
export async function getSummary(req, res, next) {
  try {
    const now = Date.now()

    // Return cached response if fresh
    if (summaryCache && (now - summaryCacheTime) < SUMMARY_TTL) {
      return res.json(summaryCache)
    }

    const [oamResult, anomalyResult] = await Promise.allSettled([
      oam.getMetrics(req),
      anomaly.getAnomalySummary(req),
    ])

    const oamData    = oamResult.status    === 'fulfilled' ? oamResult.value    : null
    const anomalyData = anomalyResult.status === 'fulfilled' ? anomalyResult.value : null

    if (oamResult.status === 'rejected') {
      logger.warn({ err: oamResult.reason?.message }, 'OAM metrics fetch failed — using fallback')
    }
    if (anomalyResult.status === 'rejected') {
      logger.warn({ err: anomalyResult.reason?.message }, 'Anomaly summary fetch failed — using fallback')
    }

    const metrics = {
      devicesOnline:     oamData?.online      ?? summaryCache?.devicesOnline     ?? 0,
      devicesTotal:      oamData?.total       ?? summaryCache?.devicesTotal      ?? 0,
      anomaliesDetected: oamData?.with_anomaly ?? summaryCache?.anomaliesDetected ?? 0,
      devicesOffline:    oamData?.offline     ?? summaryCache?.devicesOffline    ?? 0,
      // Unused fields — zero fallbacks
      totalRequests:     0,
      requestsPerSecond: 0,
      totalDeployments:  0,
      firewallActions:   { total: 0, systemBlocks: 0, systemChallenges: 0, customWafBlocks: 0 },
      botManagement:     { botsBlocked: 0, humansVerified: 0 },
      aiGateway:         { requests: 0, avgLatency: 0 },
      cache:             { hitsServed: 0, hitRate: 0 },
      anomalySummary:    anomalyData ?? { total: 0, bySeverity: {}, trending: [] },
      _sources: {
        oam:     oamResult.status    === 'fulfilled' ? 'ok' : 'unavailable',
        anomaly: anomalyResult.status === 'fulfilled' ? 'ok' : 'unavailable',
      },
      _timestamp: new Date().toISOString(),
    }

    // Only cache if OAM responded — don't cache a total failure
    if (oamData) {
      summaryCache     = metrics
      summaryCacheTime = now
    }

    res.json(metrics)
  } catch (err) {
    // On unexpected error return stale cache if available
    if (summaryCache) {
      logger.warn({ err: err.message }, 'Metrics fetch failed — serving stale cache')
      return res.json({ ...summaryCache, _stale: true })
    }
    next(err)
  }
}

/**
 * GET /api/districts/stats
 * Proxied from OAM — per-district sensor counts.
 */
export async function getDistrictStats(req, res, next) {
  try {
    const now = Date.now()

    if (districtCache && (now - districtCacheTime) < DISTRICT_TTL) {
      return res.json(districtCache)
    }

    const data       = await oam.getDistrictStats(req)
    const byDistrict = data?.by_district || {}
    const result     = Object.entries(byDistrict)
      .map(([name, count]) => ({ id: name.toLowerCase().replace(/\s+/g, '_'), name, count }))
      .sort((a, b) => b.count - a.count)

    districtCache     = result
    districtCacheTime = now

    res.json(result)
  } catch (err) {
    // Serve stale district data rather than erroring
    if (districtCache) {
      logger.warn({ err: err.message }, 'District fetch failed — serving stale cache')
      return res.json(districtCache)
    }
    next(err)
  }
}
