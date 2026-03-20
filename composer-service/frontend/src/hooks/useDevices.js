import { useState, useEffect, useCallback, useRef } from 'react'
import { devicesApi } from '../services/api'

// ─── Mock Devices in OAM "sensor" format (remove when backend is live) ──────
const MOCK_DEVICES = [
  { id: 'S-001', name: 'Sensor Temperatura Lisboa', district: 'Lisboa', anomaly_status: 'NONE', ultimo_keepalive: '2s ago', current_firmware_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', pending_action: null },
  { id: 'S-002', name: 'Sensor Humidade Porto', district: 'Porto', anomaly_status: 'NONE', ultimo_keepalive: '5s ago', current_firmware_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', pending_action: null },
  { id: 'S-003', name: 'Gateway Aveiro Central', district: 'Aveiro', anomaly_status: 'NONE', ultimo_keepalive: '1s ago', current_firmware_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', pending_action: null },
  { id: 'S-004', name: 'Sensor Pressão Faro', district: 'Faro', anomaly_status: 'DETECTED', ultimo_keepalive: '45s ago', current_firmware_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', pending_action: 'FIRMWARE_UPDATE' },
  { id: 'S-005', name: 'Atuador Coimbra Norte', district: 'Coimbra', anomaly_status: null, ultimo_keepalive: null, current_firmware_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012', pending_action: 'RESTART' },
  { id: 'S-006', name: 'Sensor Luminosidade Braga', district: 'Braga', anomaly_status: 'NONE', ultimo_keepalive: '3s ago', current_firmware_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', pending_action: null },
  { id: 'S-007', name: 'Gateway Setúbal Sul', district: 'Setúbal', anomaly_status: 'NONE', ultimo_keepalive: '1s ago', current_firmware_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', pending_action: null },
  { id: 'S-008', name: 'Sensor Vento Leiria', district: 'Leiria', anomaly_status: 'NONE', ultimo_keepalive: '8s ago', current_firmware_id: 'd4e5f6a7-b8c9-0123-defa-234567890123', pending_action: null },
]

const USE_MOCK = false
const POLL_INTERVAL = 5000 // refresh every 5 seconds
// ─── End Mock ───────────────────────────────────────────────────────────────

// Normalize OAM sensor → frontend device (same logic as backend Device.js)
const STALE_THRESHOLD_MS = 120000 // 2 minutes

function normalize(sensor) {
  // Derive online status from ultimo_keepalive
  let online = false
  if (sensor.ultimo_keepalive) {
    const lastSeen = new Date(sensor.ultimo_keepalive)
    online = !isNaN(lastSeen.getTime()) && (Date.now() - lastSeen.getTime()) < STALE_THRESHOLD_MS
  }

  const anomaly = (sensor.anomaly_status || '').toUpperCase()
  let status = 'inactive'
  if (online && anomaly === 'DETECTED') status = 'warning'
  else if (online) status = 'active'

  return {
    id: sensor.id,
    name: sensor.name,
    district: sensor.district,
    status,
    anomalyStatus: sensor.anomaly_status || null,
    firmware: sensor.current_firmware_id || null,
    lastSeen: sensor.ultimo_keepalive || null,
    pendingAction: sensor.pending_action && sensor.pending_action !== 'NONE'
      ? sensor.pending_action
      : null,
    registeredAt: sensor.created_at || null,
  }
}

export default function useDevices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchDevices = useCallback(async () => {
    try {
      if (USE_MOCK) {
        setDevices(MOCK_DEVICES.map(normalize))
      } else {
        const res = await devicesApi.getAll()
        const data = Array.isArray(res.data) ? res.data : res.data?.sensors || res.data?.data || []
        setDevices(data)
      }
      setError(null)
    } catch (err) {
      console.error('[useDevices] Fetch failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll for device updates
  useEffect(() => {
    fetchDevices()
    intervalRef.current = setInterval(fetchDevices, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [fetchDevices])

  const createDevice = useCallback(async (deviceData) => {
    try {
      if (USE_MOCK) {
        const newSensor = {
          id: `S-${String(devices.length + 1).padStart(3, '0')}`,
          name: deviceData.name,
          district: deviceData.district,
          anomaly_status: null,
          ultimo_keepalive: null,
          current_firmware_id: deviceData.firmware_id || null,
          pending_action: null,
        }
        setDevices((prev) => [normalize(newSensor), ...prev])
        return normalize(newSensor)
      } else {
        const res = await devicesApi.create(deviceData)
        setDevices((prev) => [res.data, ...prev])
        return res.data
      }
    } catch (err) {
      console.error('[useDevices] Create failed:', err)
      setError(err.message)
      throw err
    }
  }, [devices.length])

  const deleteDevice = useCallback(async (id) => {
    try {
      if (USE_MOCK) {
        setDevices((prev) => prev.filter((d) => d.id !== id))
      } else {
        await devicesApi.delete(id)
        setDevices((prev) => prev.filter((d) => d.id !== id))
      }
    } catch (err) {
      console.error('[useDevices] Delete failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

  // Single-pass stats — apply same stale logic as DeviceTable
  const STALE_THRESHOLD_MS = 120000 // 2 minutes
  const stats = devices.reduce(
    (acc, d) => {
      acc.total++

      // Check if sensor is stale (no keepalive recently)
      let effectiveStatus = d.status
      if (d.status === 'active' && d.lastSeen) {
        const lastDate = new Date(d.lastSeen)
        if (!isNaN(lastDate.getTime()) && (Date.now() - lastDate.getTime()) > STALE_THRESHOLD_MS) {
          effectiveStatus = 'inactive'
        }
      } else if (d.status === 'active' && !d.lastSeen) {
        effectiveStatus = 'inactive'
      }

      if (effectiveStatus === 'active') acc.active++
      else if (effectiveStatus === 'warning') acc.warning++
      else if (effectiveStatus === 'inactive') acc.inactive++
      else if (effectiveStatus === 'pending') acc.pending++
      return acc
    },
    { total: 0, active: 0, warning: 0, inactive: 0, pending: 0 }
  )

  return {
    devices,
    stats,
    loading,
    error,
    createDevice,
    deleteDevice,
    refetch: fetchDevices,
}
}
