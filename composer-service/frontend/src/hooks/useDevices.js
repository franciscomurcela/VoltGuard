import { useState, useEffect, useCallback } from 'react'
import { devicesApi } from '../services/api'

// ─── Mock Devices (remove when backend is live) ─────────────────────────────
const MOCK_DEVICES = [
  { id: 'DEV-001', name: 'Sensor Temperatura Lisboa', type: 'temperature', district: 'Lisboa', status: 'active', ip: '192.168.1.101', firmware: 'v2.4.1', lastSeen: '2s ago', registeredAt: '2025-01-15' },
  { id: 'DEV-002', name: 'Sensor Humidade Porto', type: 'humidity', district: 'Porto', status: 'active', ip: '192.168.1.102', firmware: 'v2.4.1', lastSeen: '5s ago', registeredAt: '2025-01-18' },
  { id: 'DEV-003', name: 'Gateway Aveiro Central', type: 'gateway', district: 'Aveiro', status: 'active', ip: '192.168.1.103', firmware: 'v3.1.0', lastSeen: '1s ago', registeredAt: '2025-02-02' },
  { id: 'DEV-004', name: 'Sensor Pressão Faro', type: 'pressure', district: 'Faro', status: 'warning', ip: '192.168.2.15', firmware: 'v2.3.8', lastSeen: '45s ago', registeredAt: '2025-02-10' },
  { id: 'DEV-005', name: 'Atuador Coimbra Norte', type: 'actuator', district: 'Coimbra', status: 'inactive', ip: '192.168.2.22', firmware: 'v1.9.2', lastSeen: '3h ago', registeredAt: '2025-03-01' },
  { id: 'DEV-006', name: 'Sensor Luminosidade Braga', type: 'luminosity', district: 'Braga', status: 'active', ip: '192.168.3.10', firmware: 'v2.4.1', lastSeen: '3s ago', registeredAt: '2025-03-05' },
  { id: 'DEV-007', name: 'Gateway Setúbal Sul', type: 'gateway', district: 'Setúbal', status: 'active', ip: '192.168.3.20', firmware: 'v3.1.0', lastSeen: '1s ago', registeredAt: '2025-03-12' },
  { id: 'DEV-008', name: 'Sensor Vento Leiria', type: 'wind', district: 'Leiria', status: 'active', ip: '192.168.4.05', firmware: 'v2.2.0', lastSeen: '8s ago', registeredAt: '2025-03-20' },
]

const USE_MOCK = false
// ─── End Mock ───────────────────────────────────────────────────────────────

export default function useDevices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDevices = useCallback(async () => {
    try {
      if (USE_MOCK) {
        setDevices(MOCK_DEVICES)
      } else {
        const res = await devicesApi.getAll()
        setDevices(res.data)
      }
      setError(null)
    } catch (err) {
      console.error('[useDevices] Fetch failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const createDevice = useCallback(async (deviceData) => {
    try {
      if (USE_MOCK) {
        const newDevice = {
          ...deviceData,
          id: `DEV-${String(devices.length + 1).padStart(3, '0')}`,
          status: 'pending',
          lastSeen: 'just now',
          registeredAt: new Date().toISOString().split('T')[0],
        }
        setDevices((prev) => [newDevice, ...prev])
        return newDevice
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

  const updateDevice = useCallback(async (id, data) => {
    try {
      if (USE_MOCK) {
        setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...data } : d)))
      } else {
        await devicesApi.update(id, data)
        setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...data } : d)))
      }
    } catch (err) {
      console.error('[useDevices] Update failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

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

  const stats = {
    total: devices.length,
    active: devices.filter((d) => d.status === 'active').length,
    warning: devices.filter((d) => d.status === 'warning').length,
    inactive: devices.filter((d) => d.status === 'inactive').length,
    pending: devices.filter((d) => d.status === 'pending').length,
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
