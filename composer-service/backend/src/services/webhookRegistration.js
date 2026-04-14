import client from '../utils/proxyClient.js'
import { getServiceUrl } from '../utils/serviceDiscovery.js'
import logger from '../utils/logger.js'

const APP_TOKEN = process.env.ANOMALY_APP_TOKEN || 'token_do_composer_123'
const COMPOSER_BASE_URL = process.env.COMPOSER_BASE_URL || 'http://compositor-backend:8080'
const WEBHOOK_PATH = '/api/webhooks/anomaly'

/**
 * Registers the compositor as a webhook consumer on the anomaly detection service.
 * Called once on startup. Idempotent — skips registration if the URL is already registered.
 */
export async function registerAnomalyWebhook() {
  const targetUrl = `${COMPOSER_BASE_URL}${WEBHOOK_PATH}`

  try {
    // Check if already registered to avoid duplicates across restarts
    const listUrl = getServiceUrl('anomaly', '/v1/webhooks')
    const listRes = await client.get(listUrl, {
      headers: { 'X-App-Token': APP_TOKEN },
      timeout: 5000,
    })

    const existing = listRes.data?.webhooks ?? listRes.data ?? []
    const alreadyRegistered =
      Array.isArray(existing) &&
      existing.some(
        (wh) => wh.target_url === targetUrl && wh.status === 'active',
      )

    if (alreadyRegistered) {
      logger.info({ targetUrl }, 'Anomaly webhook already registered — skipping')
      return
    }

    // Register the webhook for anomaly_detected events
    const registerUrl = getServiceUrl('anomaly', '/v1/webhooks')
    const res = await client.post(
      registerUrl,
      { target_url: targetUrl, event_type: 'anomaly_detected' },
      { headers: { 'X-App-Token': APP_TOKEN }, timeout: 5000 },
    )

    logger.info(
      { webhookId: res.data?.webhook_id, targetUrl },
      'Anomaly webhook registered — notifications pipeline active',
    )
  } catch (err) {
    // Non-fatal: the pipeline will be inactive until the next restart succeeds
    logger.warn(
      { err: err.message, targetUrl },
      'Failed to register anomaly webhook — automatic notifications will be inactive',
    )
  }
}
