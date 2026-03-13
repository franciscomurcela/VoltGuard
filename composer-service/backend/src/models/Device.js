// ─── Device Model ────────────────────────────────────────────────────────────
// The compositor does NOT own devices (OAM does), but this model defines
// the expected shape for validation before forwarding to OAM, and for
// normalizing responses coming back from OAM.

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

  if (!payload.district || !DISTRICTS.includes(payload.district)) {
    errors.push(`district must be one of the 18 Portuguese districts`)
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  // Return sanitized data — only fields OAM accepts
  return {
    valid: true,
    data: {
      name: payload.name.trim(),
      district: payload.district,
    },
  }
}

/**
 * Normalize a device response from OAM into the shape the frontend expects.
 */
export function normalizeDevice(oamDevice) {
  let status = 'active'
  if (oamDevice.anomaly_status === 'DETECTED') {
    status = 'warning'
  } else if (oamDevice.anomaly_status === 'NONE') {
    status = 'active'
  }

  return {
    id: oamDevice.id,
    name: oamDevice.name,
    district: oamDevice.district,
    lastSeen: oamDevice.ultimo_keepalive || null,
    firmware: oamDevice.current_firmware_id || 'none',
    status,
    registeredAt: oamDevice.created_at || null,
    pendingAction: oamDevice.pending_action || null,
    type: null,
    ip: null,
    mac: null,
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
  DEVICE_STATUSES,
  DISTRICTS,
  validateDevice,
  normalizeDevice,
  normalizeDevices,
}
