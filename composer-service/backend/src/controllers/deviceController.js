import * as deviceService from '../services/deviceService.js'
import * as oam from '../services/oamProxy.js'
import { auditLog } from '../config/database.js'
import { extractUser } from '../middleware/auth.js'
import logger from '../utils/logger.js'

export async function listDevices(req, res, next) {
  try {
    const data = await deviceService.listDevices(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function getDevice(req, res, next) {
  try {
    const data = await deviceService.getDeviceById(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function registerDevice(req, res, next) {
  try {
    const data = await deviceService.registerDevice(req, req.body)
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
}

export async function modifyDevice(req, res, next) {
  try {
    const data = await deviceService.updateDevice(req, req.params.id, req.body)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function removeDevice(req, res, next) {
  try {
    await deviceService.deleteDevice(req, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function deviceStats(req, res, next) {
  try {
    const stats = await deviceService.getDeviceStats(req)
    res.json(stats)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/devices/:id/actions
 * Body: { action: "REBOOT" | "CLEAR_ANOMALY" | "FIRMWARE_UPDATE", firmware_id?: string }
 * Proxies to OAM POST /sensors/:id/actions
 */
export async function dispatchAction(req, res, next) {
  try {
    const { id } = req.params
    const { action, firmware_id } = req.body

    if (!action) {
      const err = new Error('action is required')
      err.name = 'ValidationError'
      throw err
    }

    const data = await oam.dispatchSensorAction(req, id, { action, firmware_id })

    const user = extractUser(req)
    auditLog({
      action: `DEVICE_ACTION:${action}`,
      resource: 'device',
      resourceId: id,
      userId: user?.id,
      userEmail: user?.email,
      details: { action, firmware_id },
      upstream: 'oam',
    })

    logger.info({ deviceId: id, action, by: user?.email }, 'Device action dispatched')
    res.json(data)
  } catch (err) {
    next(err)
  }
}
