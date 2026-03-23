// ─── Device Model ────────────────────────────────────────────────────────────
// Maps between OAM's "sensor" schema and the compositor's frontend schema.
// OAM is the source of truth — the compositor normalizes and validates.
// ONLY uses fields OAM actually provides. No fabricated data.

export const DEVICE_STATUSES = ['active', 'warning', 'inactive']

export const DISTRICTS = [
  'Lisboa', 'Porto', 'Aveiro', 'Coimbra', 'Faro', 'Braga', 'Setúbal',
  'Évora', 'Viseu', 'Guarda', 'Bragança', 'Vila Real', 'Viana do Castelo',
  'Leiria', 'Santarém', 'Castelo Branco', 'Portalegre', 'Beja',
]

// ─── Validation ─────────────────────────────────────────────────────────────
// OAM's POST /sensors accepts: { name, district, firmware_id? }

export function validateDevice(payload) {
  const errors = []

  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length < 2) {
    errors.push('name is required and must be at least 2 characters')
  }

  if (!payload.district || !DISTRICTS.includes(payload.district)) {
    errors.push('district must be one of the 18 Portuguese districts')
  }

  if (payload.firmware_id && typeof payload.firmware_id !== 'string') {
    errors.push('firmware_id must be a string (UUID)')
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  const data = { name: payload.name.trim(), district: payload.district }
  if (payload.firmware_id) data.firmware_id = payload.firmware_id.trim()

  return { valid: true, data }
}

// ─── Status Logic ───────────────────────────────────────────────────────────
// Status is derived from TWO OAM fields:
//   ultimo_keepalive → is the sensor online? (recent heartbeat)
//   anomaly_status   → does it have an active anomaly?
//
// Rules:
//   keepalive recent  + anomaly NONE     → "active"   (green)
//   keepalive recent  + anomaly DETECTED → "warning"  (yellow)
//   keepalive stale/null + any           → "inactive"  (grey)

const STALE_THRESHOLD_MS = 120000 // 2 minutes

function isOnline(ultimoKeepalive) {
  if (!ultimoKeepalive) return false
  const lastSeen = new Date(ultimoKeepalive)
  if (isNaN(lastSeen.getTime())) return false
  return (Date.now() - lastSeen.getTime()) < STALE_THRESHOLD_MS
}

function deriveStatus(oamDevice) {
  const online = isOnline(oamDevice.ultimo_keepalive)
  const anomaly = (oamDevice.anomaly_status || '').toUpperCase()

  if (!online) return 'inactive'
  if (anomaly === 'DETECTED') return 'warning'
  return 'active'
}

// ─── Normalization ──────────────────────────────────────────────────────────
// OAM field              → Compositor field
// ─────────────────────────────────────────
// id                     → id
// name                   → name
// district               → district
// ultimo_keepalive       → lastSeen (raw ISO timestamp)
// current_firmware_id    → firmware (UUID or null)
// anomaly_status         → anomalyStatus (raw from OAM)
// pending_action         → pendingAction (null if "NONE")
// created_at             → registeredAt
// (status is COMPUTED from ultimo_keepalive + anomaly_status)

export function normalizeDevice(oamDevice) {
  return {
    id: oamDevice.id,
    name: oamDevice.name,
    district: oamDevice.district,
    status: deriveStatus(oamDevice),
    anomalyStatus: oamDevice.anomaly_status || null,
    firmware: oamDevice.current_firmware_id || null,
    firmwareUpdatePending: oamDevice.firmware_update_pending === true,
    lastSeen: oamDevice.ultimo_keepalive || null,
    pendingAction: oamDevice.pending_action && oamDevice.pending_action !== 'NONE'
      ? oamDevice.pending_action
      : null,
    registeredAt: oamDevice.created_at || null,
  }
}

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
