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
    const eventsToRegister = ['anomaly_detected', 'measurement_processed']
    const registerUrl = getServiceUrl('anomaly', '/v1/webhooks')

    for (const eventType of eventsToRegister) {
      const already =
        Array.isArray(existing) &&
        existing.some(
          (wh) => wh.target_url === targetUrl && wh.status === 'active' && wh.event_type === eventType,
        )

      if (already) {
        logger.info({ targetUrl, eventType }, 'Anomaly webhook already registered for event — skipping')
        continue
      }

      const res = await client.post(
        registerUrl,
        { target_url: targetUrl, event_type: eventType },
        { headers: { 'X-App-Token': APP_TOKEN }, timeout: 5000 },
      )

      logger.info(
        { webhookId: res.data?.webhook_id, targetUrl, eventType },
        'Anomaly webhook registered',
      )
    }
  } catch (err) {
    // Non-fatal: the pipeline will be inactive until the next restart succeeds
    logger.warn(
      { err: err.message, targetUrl },
      'Failed to register anomaly webhook — automatic notifications will be inactive',
    )
  }
}
