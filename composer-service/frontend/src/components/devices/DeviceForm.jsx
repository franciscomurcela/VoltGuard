import { useState } from 'react'

const DISTRICTS = [
  'Lisboa', 'Porto', 'Aveiro', 'Coimbra', 'Faro', 'Braga', 'Setúbal',
  'Évora', 'Viseu', 'Guarda', 'Bragança', 'Vila Real', 'Viana do Castelo',
  'Leiria', 'Santarém', 'Castelo Branco', 'Portalegre', 'Beja',
]

const INITIAL_FORM = {
  name: '',
  district: 'Lisboa',
}

export default function DeviceForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isValid = form.name.trim()

  const handleSubmit = async () => {
    if (!isValid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(form)
      setForm(INITIAL_FORM)
    } catch (err) {
      console.error('Device registration failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="animate-scale-in"
      style={{
        padding: 24,
        background: 'var(--accent-blue-glow)',
        border: '1px solid rgba(14,165,233,0.15)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 24,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--accent-blue)',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 18,
        }}
      >
        New Device Registration
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Device Name */}
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 5 }}>
            Device Name
          </label>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Sensor Temperatura Braga"
          />
        </div>

        {/* District */}
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 5 }}>
            District
          </label>
          <select value={form.district} onChange={(e) => updateField('district', e.target.value)}>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          style={{
            padding: '9px 24px',
            background: !isValid ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            borderRadius: 'var(--radius-md)',
            color: !isValid ? 'var(--text-faint)' : '#fff',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {submitting ? 'Provisioning...' : 'Register & Provision'}
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-faint)',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
