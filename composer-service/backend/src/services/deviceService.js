import * as oam from './oamProxy.js'
import { validateDevice, normalizeDevices, normalizeDevice } from '../models/Device.js'
import { auditLog, cacheGet, cacheSet, cacheDelete } from '../config/database.js'
import { extractUser } from '../middleware/auth.js'
import logger from '../utils/logger.js'

const CACHE_TTL = 10 // seconds — short TTL since device data changes

// ─── Read Operations ────────────────────────────────────────────────────────

export async function listDevices(req) {
  const cached = cacheGet('devices:all')
  if (cached) {
    logger.debug('Serving devices from cache')
    return cached
  }

  const rawDevices = await oam.getAllDevices(req)

  const devices = normalizeDevices(
    Array.isArray(rawDevices) ? rawDevices : rawDevices?.devices || rawDevices?.data || []
  )

  cacheSet('devices:all', devices, CACHE_TTL)
  return devices
}

export async function getDeviceById(req, id) {
  const cached = cacheGet(`devices:${id}`)
  if (cached) return cached

  const rawDevice = await oam.getDeviceById(req, id)
  const device = normalizeDevice(rawDevice)

  cacheSet(`devices:${id}`, device, CACHE_TTL)
  return device
}

// ─── Write Operations ───────────────────────────────────────────────────────

export async function registerDevice(req, payload) {
  const { valid, data, errors } = validateDevice(payload)
  if (!valid) {
    const err = new Error(`Validation failed: ${errors.join('; ')}`)
    err.name = 'ValidationError'
    err.details = errors
    throw err
  }

  const created = await oam.createDevice(req, data)
  const normalized = normalizeDevice(created)

  const user = extractUser(req)
  auditLog({
    action: 'CREATE',
    resource: 'device',
    resourceId: normalized.id,
    userId: user?.id,
    userEmail: user?.email,
    details: { name: data.name, type: data.type, district: data.district },
    upstream: 'oam',
  })

  // Properly invalidate — delete the key, don't write null
  cacheDelete('devices:all')

  logger.info({ deviceId: normalized.id, name: data.name, by: user?.email }, 'Device registered')
  return normalized
}

export async function updateDevice(req, id, payload) {
  if (payload.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(payload.ip)) {
    const err = new Error('Invalid IP address format')
    err.name = 'ValidationError'
    throw err
  }

  const updated = await oam.updateDevice(req, id, payload)
  const normalized = normalizeDevice(updated)

  const user = extractUser(req)
  auditLog({
    action: 'UPDATE',
    resource: 'device',
    resourceId: id,
    userId: user?.id,
    userEmail: user?.email,
    details: payload,
    upstream: 'oam',
  })

  cacheDelete('devices:all')
  cacheDelete(`devices:${id}`)

  logger.info({ deviceId: id, by: user?.email }, 'Device updated')
  return normalized
}

export async function deleteDevice(req, id) {
  await oam.deleteDevice(req, id)

  const user = extractUser(req)
  auditLog({
    action: 'DELETE',
    resource: 'device',
    resourceId: id,
    userId: user?.id,
    userEmail: user?.email,
    details: null,
    upstream: 'oam',
  })

  cacheDelete('devices:all')
  cacheDelete(`devices:${id}`)

  logger.info({ deviceId: id, by: user?.email }, 'Device deleted')
}

// ─── Stats (single-pass) ───────────────────────────────────────────────────

export async function getDeviceStats(req) {
  const devices = await listDevices(req)

  // Single iteration instead of 5 separate .filter() calls
  const stats = {
    total: devices.length,
    active: 0,
    warning: 0,
    inactive: 0,
    pending: 0,
    byDistrict: {},
    byType: {},
  }

  for (const d of devices) {
    // Count by status
    if (d.status === 'active') stats.active++
    else if (d.status === 'warning') stats.warning++
    else if (d.status === 'inactive') stats.inactive++
    else if (d.status === 'pending') stats.pending++

    // Count by district
    if (d.district) {
      stats.byDistrict[d.district] = (stats.byDistrict[d.district] || 0) + 1
    }

    // Count by type
    if (d.type) {
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1
    }
  }

  return stats
}

export default { listDevices, getDeviceById, registerDevice, updateDevice, deleteDevice, getDeviceStats }
