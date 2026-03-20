import { useState } from 'react'
import useDevices from '../hooks/useDevices'
import DeviceTable from '../components/devices/DeviceTable'
import DeviceForm from '../components/devices/DeviceForm'
import SensorActionsPanel from '../components/devices/SensorActionsPanel'

export default function Devices() {
  const { devices, stats, loading, createDevice, deleteDevice, refetch } = useDevices()
  const [showForm, setShowForm] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  const handleCreate = async (formData) => {
    await createDevice(formData)
    setShowForm(false)
  }

  const selectedDevice = selectedDeviceId
    ? devices.find((d) => d.id === selectedDeviceId) || null
    : null

  const handleRowClick = (deviceId) => {
    setSelectedDeviceId((prev) => (prev === deviceId ? null : deviceId))
  }

  const handleActionComplete = () => {
    refetch()
  }

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div
          className="mono"
          style={{ fontSize: 13, color: 'var(--text-faint)', animation: 'pulse 2s ease infinite' }}
        >
          Loading sensor registry...
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            Sensor Registry
          </h2>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            {stats.total} sensors registered · {stats.active} online · {stats.inactive} offline · {stats.warning} anomalies
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '9px 22px',
            background: showForm ? 'var(--accent-red-dim)' : 'var(--accent-blue-dim)',
            border: `1px solid ${showForm ? 'rgba(239,68,68,0.25)' : 'rgba(14,165,233,0.25)'}`,
            borderRadius: 'var(--radius-md)',
            color: showForm ? 'var(--accent-red)' : 'var(--accent-blue)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showForm ? 'Cancel' : '+ Register Sensor'}
        </button>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Active', value: stats.active, color: 'var(--accent-green)' },
          { label: 'Anomaly', value: stats.warning, color: 'var(--accent-yellow)' },
          { label: 'Inactive', value: stats.inactive, color: 'var(--text-faint)' },
          { label: 'Pending', value: stats.pending, color: 'var(--accent-blue)' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '14px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Registration form */}
      {showForm && (
        <DeviceForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Sensor table — click a row to expand actions */}
      <DeviceTable
        devices={devices}
        onDelete={deleteDevice}
        onRowClick={handleRowClick}
        selectedId={selectedDeviceId}
      />

      {/* Actions panel — reboot, clear anomaly, firmware update */}
      {selectedDevice && (
        <SensorActionsPanel
          device={selectedDevice}
          onClose={() => setSelectedDeviceId(null)}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  )
}
