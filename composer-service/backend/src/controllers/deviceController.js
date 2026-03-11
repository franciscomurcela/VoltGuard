import * as deviceService from '../services/deviceService.js'
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
