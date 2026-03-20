import * as anomalyProxy from '../services/anomalyProxy.js'
import * as notificationProxy from '../services/notificationProxy.js'
import * as preferencesProxy from '../services/preferencesProxy.js'
import logger from '../utils/logger.js'

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
 * GET /api/anomalies/model-config
 */
export async function getModelConfig(req, res, next) {
  try {
    const url = anomalyProxy.getServiceUrl
    // Use the proxy client directly for model config
    const client = (await import('../utils/proxyClient.js')).default
    const { forwardHeaders } = await import('../utils/proxyClient.js')
    const { getServiceUrl } = await import('../utils/serviceDiscovery.js')

    const APP_TOKEN = process.env.ANOMALY_APP_TOKEN || 'token_do_composer_123'
    const headers = forwardHeaders(req)
    delete headers.Authorization
    headers['X-App-Token'] = APP_TOKEN

    const apiUrl = getServiceUrl('anomaly', '/v1/models/config')
    const response = await client.get(apiUrl, { headers })
    res.json(response.data)
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/anomalies/model-config
 */
export async function updateModelConfig(req, res, next) {
  try {
    const client = (await import('../utils/proxyClient.js')).default
    const { forwardHeaders } = await import('../utils/proxyClient.js')
    const { getServiceUrl } = await import('../utils/serviceDiscovery.js')

    const APP_TOKEN = process.env.ANOMALY_APP_TOKEN || 'token_do_composer_123'
    const headers = forwardHeaders(req)
    delete headers.Authorization
    headers['X-App-Token'] = APP_TOKEN

    const apiUrl = getServiceUrl('anomaly', '/v1/models/config')
    const response = await client.put(apiUrl, req.body, { headers })

    logger.info({ config: req.body }, 'Model config updated via compositor')
    res.json(response.data)
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
