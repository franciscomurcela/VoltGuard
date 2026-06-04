import * as notificationProxy from '../services/notificationProxy.js'
import * as preferencesProxy from '../services/preferencesProxy.js'
import { updateProcessingState } from '../state/processingState.js'
import logger from '../utils/logger.js'

/**
 * Fetches a user's preferences and dispatches anomaly notifications
 * to all their enabled channels (email, SMS).
 *
 * @param {import('express').Request} req - Original request (for correlation headers)
 * @param {object} opts
 * @param {string} opts.userId       - Keycloak user ID
 * @param {object} opts.anomalyInfo  - Anomaly payload from the detection service
 */
export async function dispatchAnomalyNotification(req, { userId, anomalyInfo }) {
  const { source_id, metric_name, severity, anomaly_id } = anomalyInfo ?? {}

  let preferences
  try {
    preferences = await preferencesProxy.getPreferencesByUserId(userId)
  } catch (err) {
    logger.warn({ userId, err: err.message }, 'Could not fetch preferences for user — skipping')
    return { userId, status: 'skipped', reason: 'preferences_not_found' }
  }

  const channels = preferences?.channels ?? {}
  const targets = {
    email: preferences?.target_email ?? null,
    sms:   preferences?.target_phone ?? null,
  }

  const alertType = severity === 'critical' ? 'critical' : 'warnings'
  const messageTemplate =
    `Anomalia detetada em ${source_id ?? 'sensor_desconhecido'}: ` +
    `${metric_name ?? 'metric'} (severity=${severity ?? 'medium'}) ` +
    `[ID: ${anomaly_id ?? 'n/a'}]`

  const sendOps = []

  if (channels.email && targets.email) {
    sendOps.push(
      notificationProxy.sendNotification(req, {
        target:           targets.email,
        channel:          'email',
        alert_type:       alertType,
        message_template: messageTemplate,
      }),
    )
  }

  if (channels.sms && targets.sms) {
    sendOps.push(
      notificationProxy.sendNotification(req, {
        target:           targets.sms,
        channel:          'twilio_sms',
        alert_type:       alertType,
        message_template: messageTemplate,
      }),
    )
  }

  if (sendOps.length === 0) {
    return { userId, status: 'no_channels_enabled' }
  }

  const results = await Promise.allSettled(sendOps)
  return {
    userId,
    status: 'dispatched',
    results: results.map((r) =>
      r.status === 'fulfilled'
        ? { status: 'fulfilled', data: r.value }
        : { status: 'rejected', error: r.reason?.message },
    ),
  }
}

/**
 * POST /api/webhooks/anomaly
 *
 * Receiver for the anomaly detection service webhook.
 * Responds immediately with 200 so the anomaly service is not blocked,
 * then dispatches notifications to all configured users in the background.
 */
export async function handleAnomalyWebhook(req, res) {
  const { event_type, payload } = req.body ?? {}

  // Acknowledge immediately — anomaly service has a 5 s timeout per webhook call
  res.status(200).json({ status: 'received' })

  if (event_type === 'measurement_processed') {
    const { source_id, status, anomalies_detected, metric_name } = payload ?? {}
    if (source_id) {
      updateProcessingState(source_id, { status, anomalies_detected, metric_name })
      logger.info({ source_id, status, anomalies_detected }, 'Webhook: measurement_processed — processing state updated')
    }
    return
  }

  if (event_type !== 'anomaly_detected') {
    logger.debug({ event_type }, 'Webhook: ignoring non-anomaly event')
    return
  }

  const userIds = (process.env.ANOMALY_NOTIFY_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (userIds.length === 0) {
    logger.warn('ANOMALY_NOTIFY_USER_IDS is not configured — no users to notify for anomaly event')
    return
  }

  logger.info(
    { source_id: payload?.source_id, severity: payload?.severity, users: userIds.length },
    'Anomaly webhook received — dispatching notifications',
  )

  for (const userId of userIds) {
    try {
      const result = await dispatchAnomalyNotification(req, { userId, anomalyInfo: payload })
      logger.info({ userId, result }, 'Anomaly notification dispatched')
    } catch (err) {
      logger.error({ userId, err: err.message }, 'Failed to dispatch anomaly notification for user')
    }
  }
}
