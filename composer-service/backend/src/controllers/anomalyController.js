import * as anomalyProxy from '../services/anomalyProxy.js'
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
