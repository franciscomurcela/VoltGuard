import { useState, useEffect, useCallback } from 'react'
import { devicesApi } from '../services/api'

// ─── Derive frontend status from OAM fields ───────────────────────────────────
//
// OAM Sensor has no "status" field. We compute it from:
//   ultimo_keepalive   → online if within last 5 minutes (matches OAM stats query)
//   anomaly_status     → 'DETECTED' means warning
//   pending_action     → 'NONE' or action scheduled
//
// Priority: warning > active > pending > inactive
//
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes — must match OAM stats query

function deriveStatus(sensor) {
  const isOnline =
    sensor.ultimo_keepalive &&
    Date.now() - new Date(sensor.ultimo_keepalive).getTime() < ONLINE_THRESHOLD_MS

  if (isOnline && sensor.anomaly_status === 'DETECTED') return 'warning'
  if (isOnline) return 'active'
  if (sensor.pending_action && sensor.pending_action !== 'NONE') return 'pending'
  return 'inactive'
}

// Normalize raw OAM sensor into the shape the UI expects
function normalize(sensor) {
  return {
    ...sensor,
    status:        deriveStatus(sensor),
    lastSeen:      sensor.ultimo_keepalive ?? null,
    firmware:      sensor.current_firmware_id ?? 'none',
    pendingAction: sensor.pending_action === 'NONE' ? null : sensor.pending_action,
  }
}

export default function useDevices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchDevices = useCallback(async () => {
    try {
      const res = await devicesApi.getAll()
      setDevices((res.data ?? []).map(normalize))
      setError(null)
    } catch (err) {
      console.error('[useDevices] Fetch failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const createDevice = useCallback(async (deviceData) => {
    try {
      const res = await devicesApi.create(deviceData)
      const device = normalize(res.data)
      setDevices((prev) => [device, ...prev])
      return device
    } catch (err) {
      console.error('[useDevices] Create failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const updateDevice = useCallback(async (id, data) => {
    try {
      const res = await devicesApi.update(id, data)
      const updated = normalize(res.data)
      setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)))
      return updated
    } catch (err) {
      console.error('[useDevices] Update failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const deleteDevice = useCallback(async (id) => {
    try {
      await devicesApi.delete(id)
      setDevices((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      console.error('[useDevices] Delete failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const stats = {
    total:    devices.length,
    active:   devices.filter((d) => d.status === 'active').length,
    warning:  devices.filter((d) => d.status === 'warning').length,
    inactive: devices.filter((d) => d.status === 'inactive').length,
    pending:  devices.filter((d) => d.status === 'pending').length,
  }

  return {
    devices,
    stats,
    loading,
    error,
    createDevice,
    updateDevice,
    deleteDevice,
    refetch: fetchDevices,
  }
}
