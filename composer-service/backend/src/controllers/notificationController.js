import * as notificationProxy from '../services/notificationProxy.js'

/**
 * GET /api/notifications
 * Query params: limit, since, type
 */
export async function list(req, res, next) {
  try {
    const data = await notificationProxy.getNotifications(req, {
      limit: req.query.limit,
      since: req.query.since,
      type: req.query.type,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/notifications/count
 */
export async function count(req, res, next) {
  try {
    const data = await notificationProxy.getNotificationCount(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/notifications/:id/read
 */
export async function markRead(req, res, next) {
  try {
    const data = await notificationProxy.markAsRead(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}
