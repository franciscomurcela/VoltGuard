import * as notificationProxy from '../services/notificationProxy.js'
import logger from '../utils/logger.js'

/**
 * GET /api/notifications
 * Query params: limit, offset
 */
export async function list(req, res, next) {
  try {
    const data = await notificationProxy.getNotifications(req, {
      limit: req.query.limit,
      offset: req.query.offset,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/notifications/:id
 */
export async function getById(req, res, next) {
  try {
    const data = await notificationProxy.getNotificationById(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/notifications
 */
export async function send(req, res, next) {
  try {
    const data = await notificationProxy.sendNotification(req, req.body)
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/notifications  (admin only)
 * Wipes every notification, digest entry, and audit record for this client.
 * Demo/reset operation — requires the UI's double-confirmation.
 */
export async function clearNotifications(req, res, next) {
  try {
    const data = await notificationProxy.clearAllNotifications(req)
    logger.warn({ result: data }, 'Notification history cleared by admin')
    res.status(200).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/notifications/digest/process  (admin only)
 * Manually triggers digest queue processing.
 * Body: { batch_size?: number, dry_run?: boolean }
 */
export async function triggerDigest(req, res, next) {
  try {
    const { batch_size, dry_run } = req.body ?? {}
    const data = await notificationProxy.processDigest({
      batchSize: batch_size,
      dryRun:    dry_run,
    })
    logger.info({ result: data }, 'Digest queue processed via admin endpoint')
    res.json(data)
  } catch (err) {
    next(err)
  }
}
