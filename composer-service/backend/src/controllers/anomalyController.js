import * as anomalyProxy from '../services/anomalyProxy.js'
import * as notificationProxy from '../services/notificationProxy.js'
import * as preferencesProxy from '../services/preferencesProxy.js'
import * as oamProxy from '../services/oamProxy.js'
import { getProcessingState } from '../state/processingState.js'
import logger from '../utils/logger.js'

/**
 * GET /api/anomalies/processing-state/:sensorId
 * Returns the last measurement_processed webhook event received for this sensor.
 */
export function getSensorProcessingState(req, res) {
  const data = getProcessingState(req.params.sensorId)
  res.json(data ?? { status: 'unknown', updated_at: null })
}

/**
 * GET /api/anomalies
 */
export async function listAnomalies(req, res, next) {
  try {
    const data = await anomalyProxy.getAnomalies(req, {
      limit: req.query.limit,
      offset: req.query.offset,
      sourceId: req.query.source_id,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/:id
 */
export async function getAnomaly(req, res, next) {
  try {
    const data = await anomalyProxy.getAnomalyById(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/summary
 * Proxies /v1/metrics from the anomaly service
 */
export async function getSummary(req, res, next) {
  try {
    const data = await anomalyProxy.getAnomalySummary(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/by-sensor
 * Optional query: source_id, client_id
 */
export async function getBySensorSummary(req, res, next) {
  try {
    const data = await anomalyProxy.getAnomaliesBySensor(req, {
      sourceId: req.query.source_id,
      clientId: req.query.client_id,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/model-config
 */
export async function getModelConfig(req, res, next) {
  try {
    const data = await anomalyProxy.getModelConfig(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/anomalies/model-config
 */
export async function updateModelConfig(req, res, next) {
  try {
    const data = await anomalyProxy.updateModelConfig(req, req.body)
    logger.info({ config: req.body }, 'Model config updated via compositor')
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/forecasts/latest/:sensorId
 */
export async function getLatestForecast(req, res, next) {
  try {
    const data = await anomalyProxy.getLatestForecast(req, req.params.sensorId, {
      metricName: req.query.metric_name,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/anomalies/analysis/:sensorId
 * Optional body/query: metric_name
 */
export async function triggerSensorAnalysis(req, res, next) {
  try {
    const metricName = req.body?.metric_name || req.query.metric_name
    const data = await anomalyProxy.reprocessSensorMeasurements(req, req.params.sensorId, {
      metricName,
    })
    res.status(202).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/export
 * Query: ?district=Porto&severity=CRITICAL&from=2024-01-01&to=2024-12-31&format=csv|json
 */
export async function exportAnomalies(req, res, next) {
  try {
    const { district, severity, from, to, format = 'json' } = req.query

    // Fetch all anomalies (auto-paginate)
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

    // Build district lookup if filtering by district
    let sensorDistrict = {}
    if (district) {
      const sensorsRaw = await oamProxy.getAllDevices(req)
      const sensors = Array.isArray(sensorsRaw)
        ? sensorsRaw
        : (sensorsRaw?.sensors ?? sensorsRaw?.data ?? [])
      for (const s of sensors) {
        sensorDistrict[s.id] = s.district ?? 'Unknown'
      }
    }

    // Apply filters
    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null

    const filtered = all.filter((a) => {
      if (severity && (a.severity ?? '').toUpperCase() !== severity.toUpperCase()) return false
      if (district && sensorDistrict[a.source_id] !== district) return false
      if (fromDate && a.timestamp && new Date(a.timestamp) < fromDate) return false
      if (toDate && a.timestamp && new Date(a.timestamp) > toDate) return false
      return true
    })

    logger.info(
      { total: all.length, filtered: filtered.length, district, severity, from, to, format },
      'Anomaly export requested',
    )

    if (format === 'csv') {
      const headers = ['anomaly_id', 'source_id', 'district', 'metric_name', 'timestamp', 'severity', 'confidence_score', 'measurement_id']
      const rows = filtered.map((a) => [
        a.anomaly_id ?? '',
        a.source_id ?? '',
        sensorDistrict[a.source_id] ?? (district || ''),
        a.metric_name ?? '',
        a.timestamp ?? '',
        a.severity ?? '',
        a.confidence_score ?? '',
        a.measurement_id ?? '',
      ])

      const csv = [headers, ...rows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const filename = `anomalies_export_${new Date().toISOString().slice(0, 10)}.csv`
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.send(csv)
    }

    res.json({
      exported_at: new Date().toISOString(),
      filters: { district: district || null, severity: severity || null, from: from || null, to: to || null },
      total: filtered.length,
      items: filtered,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/anomalies/simulate-notification
 * Simulates the anomaly->notification flow using user preferences by secret.
 */
export async function simulateAnomalyNotification(req, res, next) {
  try {
    const {
      user_id,
      secret,
      source_id,
      metric_name,
      value,
      severity,
      alert_type,
      message_template,
    } = req.body || {}

    if (!user_id && !secret) {
      const err = new Error('user_id is required (or secret as fallback)')
      err.statusCode = 400
      throw err
    }

    let preferences
    if (user_id) {
      preferences = await preferencesProxy.getPreferencesByUserId(user_id)
    } else {
      preferences = await preferencesProxy.getPreferences(secret)
    }

    const channels = preferences?.channels || {}
    const targets = {
      email: preferences?.target_email || null,
      sms: preferences?.target_phone || null,
    }

    const effectiveAlertType = alert_type || 'critical'
    const generatedTemplate = message_template ||
      `Anomalia detetada em ${source_id || 'sensor_desconhecido'}: ${metric_name || 'metric'}=${value ?? 'n/a'} (severity=${severity || 'medium'})`

    const sendOps = []

    if (channels.email && targets.email) {
      sendOps.push(
        notificationProxy.sendNotification(req, {
          target: targets.email,
          channel: 'email',
          alert_type: effectiveAlertType,
          message_template: generatedTemplate,
        })
      )
    }

    if (channels.sms && targets.sms) {
      sendOps.push(
        notificationProxy.sendNotification(req, {
          target: targets.sms,
          channel: 'twilio_sms',
          alert_type: effectiveAlertType,
          message_template: generatedTemplate,
        })
      )
    }

    if (sendOps.length === 0) {
      return res.status(200).json({
        status: 'no_channels_enabled',
        user_id: user_id || preferences?.user_id || null,
        secret,
        channels,
        targets,
        message: 'No enabled channels with valid targets found for this user.',
      })
    }

    const results = await Promise.allSettled(sendOps)

    const response = {
      status: 'simulated',
      user_id: user_id || preferences?.user_id || null,
      secret,
      source_id: source_id || null,
      metric_name: metric_name || null,
      value: value ?? null,
      severity: severity || null,
      alert_type: effectiveAlertType,
      results: results.map((result) => {
        if (result.status === 'fulfilled') {
          return { status: 'fulfilled', data: result.value }
        }
        return { status: 'rejected', error: result.reason?.message || 'unknown_error' }
      }),
    }

    logger.info({ user_id: response.user_id, secret, results: response.results.length }, 'Anomaly notification simulation executed')
    return res.status(200).json(response)
  } catch (err) {
    return next(err)
  }
}
