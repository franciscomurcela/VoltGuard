// ─── Device Model ────────────────────────────────────────────────────────────
// The compositor does NOT own devices (OAM does), but this model defines
// the expected shape for validation before forwarding to OAM, and for
// normalizing responses coming back from OAM.

export const DEVICE_TYPES = [
  'temperature',
  'humidity',
  'gateway',
  'pressure',
  'actuator',
  'luminosity',
  'wind',
  'air_quality',
  'energy',
  'water_flow',
]

export const DEVICE_STATUSES = ['active', 'inactive', 'warning', 'pending', 'maintenance']

export const DISTRICTS = [
  'Lisboa', 'Porto', 'Aveiro', 'Coimbra', 'Faro', 'Braga', 'Setúbal',
  'Évora', 'Viseu', 'Guarda', 'Bragança', 'Vila Real', 'Viana do Castelo',
  'Leiria', 'Santarém', 'Castelo Branco', 'Portalegre', 'Beja',
]

/**
 * Validate a device payload before forwarding to OAM.
 * Returns { valid: true, data } or { valid: false, errors: [] }
 */
export function validateDevice(payload) {
  const errors = []

  // Required fields
  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length < 2) {
    errors.push('name is required and must be at least 2 characters')
  }

  if (!payload.type || !DEVICE_TYPES.includes(payload.type)) {
    errors.push(`type must be one of: ${DEVICE_TYPES.join(', ')}`)
  }

  if (!payload.district || !DISTRICTS.includes(payload.district)) {
    errors.push(`district must be one of the 18 Portuguese districts`)
  }

  if (!payload.ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(payload.ip)) {
    errors.push('ip must be a valid IPv4 address')
  }

  // Optional fields with validation
  if (payload.firmware && typeof payload.firmware !== 'string') {
    errors.push('firmware must be a string')
  }

  if (payload.mac && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(payload.mac)) {
    errors.push('mac must be a valid MAC address (XX:XX:XX:XX:XX:XX)')
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  // Return sanitized data
  return {
    valid: true,
    data: {
      name: payload.name.trim(),
      type: payload.type,
      district: payload.district,
      ip: payload.ip.trim(),
      firmware: payload.firmware?.trim() || 'v1.0.0',
      mac: payload.mac?.trim() || undefined,
      description: payload.description?.trim() || undefined,
      tags: Array.isArray(payload.tags) ? payload.tags : undefined,
    },
  }
}

/**
 * Normalize a device response from OAM into the shape the frontend expects.
 * Handles any field naming discrepancies between OAM and our frontend.
 */
export function normalizeDevice(oamDevice) {
  return {
    id: oamDevice.id || oamDevice.deviceId,
    name: oamDevice.name || oamDevice.deviceName,
    type: oamDevice.type || oamDevice.deviceType,
    district: oamDevice.district || oamDevice.location?.district,
    status: oamDevice.status || 'unknown',
    ip: oamDevice.ip || oamDevice.ipAddress,
    mac: oamDevice.mac || oamDevice.macAddress || null,
    firmware: oamDevice.firmware || oamDevice.firmwareVersion || 'unknown',
    lastSeen: oamDevice.lastSeen || oamDevice.lastHeartbeat || null,
    registeredAt: oamDevice.registeredAt || oamDevice.createdAt || null,
    description: oamDevice.description || null,
    tags: oamDevice.tags || [],
  }
}

/**
 * Normalize an array of devices.
 */
export function normalizeDevices(oamDevices) {
  if (!Array.isArray(oamDevices)) return []
  return oamDevices.map(normalizeDevice)
}

export default {
  DEVICE_TYPES,
  DEVICE_STATUSES,
  DISTRICTS,
  validateDevice,
  normalizeDevice,
  normalizeDevices,
}
