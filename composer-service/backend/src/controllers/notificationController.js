import * as notificationProxy from '../services/notificationProxy.js'

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
