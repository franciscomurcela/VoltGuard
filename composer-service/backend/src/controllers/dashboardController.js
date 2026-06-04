import * as oamProxy from '../services/oamProxy.js'
import * as anomalyProxy from '../services/anomalyProxy.js'
import logger from '../utils/logger.js'

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

function isOnline(sensor) {
  if (!sensor.ultimo_keepalive) return false
  return Date.now() - new Date(sensor.ultimo_keepalive).getTime() < ONLINE_THRESHOLD_MS
}

/**
 * Fetch all anomalies from the anomaly service (auto-paginates).
 */
async function fetchAllAnomalies(req) {
  const PAGE = 100
  let offset = 0
  const all = []

  while (true) {
    const page = await anomalyProxy.getAnomalies(req, { limit: PAGE, offset })
    const items = page.items ?? []
    all.push(...items)
    if (!page.has_more || items.length < PAGE) break
    offset += PAGE
  }

  return all
}

// ─── GET /api/dashboard/overview ────────────────────────────────────────────

/**
 * Operational overview: fleet availability, active incidents, pending actions.
 */
export async function getOverview(req, res, next) {
  try {
    const [sensorsRaw, anomaliesRaw] = await Promise.all([
      oamProxy.getAllDevices(req),
      fetchAllAnomalies(req),
    ])

    const sensors = Array.isArray(sensorsRaw)
      ? sensorsRaw
      : (sensorsRaw?.sensors ?? sensorsRaw?.data ?? [])

    const total = sensors.length
    const online = sensors.filter(isOnline).length
    const offline = total - online
    const fleet_availability = total > 0 ? Math.round((online / total) * 100) : 0

    const active_incidents = sensors.filter(
      (s) => s.anomaly_status === 'DETECTED',
    ).length

    const pending_reboots = sensors.filter(
      (s) => s.pending_action === 'REBOOT',
    ).length

    const pending_firmware_updates = sensors.filter(
      (s) => s.firmware_update_pending === true,
    ).length

    const pending_actions = pending_reboots + pending_firmware_updates

    // Sensors that are both offline AND have an active anomaly (highest risk)
    const offline_with_anomaly = sensors.filter(
      (s) => !isOnline(s) && s.anomaly_status === 'DETECTED',
    ).length

    res.json({
      fleet: {
        total,
        online,
        offline,
        fleet_availability_pct: fleet_availability,
      },
      incidents: {
        active_incidents,
        offline_with_anomaly,
      },
      maintenance: {
        pending_actions,
        pending_reboots,
        pending_firmware_updates,
      },
      anomalies: {
        total_recorded: anomaliesRaw.length,
      },
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/dashboard/anomaly-stats ────────────────────────────────────────

/**
 * Anomaly analytics: frequency by district, recurrence rate, critical event rate.
 * Query: ?window=7  (days, default 30)
 */
export async function getAnomalyStats(req, res, next) {
  try {
    const windowDays = parseInt(req.query.window, 10) || 30
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

    const [sensorsRaw, anomalies] = await Promise.all([
      oamProxy.getAllDevices(req),
      fetchAllAnomalies(req),
    ])

    const sensors = Array.isArray(sensorsRaw)
      ? sensorsRaw
      : (sensorsRaw?.sensors ?? sensorsRaw?.data ?? [])

    // Build sensor_id → district map
    const sensorDistrict = {}
    for (const s of sensors) {
      sensorDistrict[s.id] = s.district ?? 'Unknown'
    }

    // Filter anomalies within the time window
    const inWindow = anomalies.filter((a) => {
      if (!a.timestamp) return true // include if no timestamp
      return new Date(a.timestamp) >= since
    })

    const total = inWindow.length

    // ── Critical event rate ──────────────────────────────────────────────────
    const critical_count = inWindow.filter(
      (a) => (a.severity ?? '').toUpperCase() === 'CRITICAL',
    ).length
    const critical_event_rate_pct =
      total > 0 ? Math.round((critical_count / total) * 100) : 0

    // ── Frequency by district ────────────────────────────────────────────────
    const districtCounts = {}
    for (const a of inWindow) {
      const district = sensorDistrict[a.source_id] ?? 'Unknown'
      districtCounts[district] = (districtCounts[district] ?? 0) + 1
    }
    const by_district = Object.entries(districtCounts)
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count)

    // ── Recurrence rate ──────────────────────────────────────────────────────
    // Sensors with more than 1 anomaly in the window
    const sensorCounts = {}
    for (const a of inWindow) {
      sensorCounts[a.source_id] = (sensorCounts[a.source_id] ?? 0) + 1
    }
    const affected_sensors = Object.keys(sensorCounts).length
    const recurring_sensors = Object.values(sensorCounts).filter((c) => c > 1).length
    const recurrence_rate_pct =
      affected_sensors > 0
        ? Math.round((recurring_sensors / affected_sensors) * 100)
        : 0

    // Top recurring sensors for diagnostics
    const top_recurring = Object.entries(sensorCounts)
      .filter(([, c]) => c > 1)
      .map(([source_id, count]) => ({
        source_id,
        district: sensorDistrict[source_id] ?? 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    res.json({
      window_days: windowDays,
      since: since.toISOString(),
      total_anomalies: total,
      critical_event_rate: {
        critical_count,
        total,
        critical_event_rate_pct,
      },
      recurrence: {
        affected_sensors,
        recurring_sensors,
        recurrence_rate_pct,
        top_recurring,
      },
      by_district,
    })
  } catch (err) {
    next(err)
  }
}
