import { useState, useEffect } from 'react'

export default function ModelConfig({ config, onSave }) {
  const [form, setForm] = useState({
    prophet_uncertainty_interval: 0.95,
    pyod_contamination_rate: 0.05,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setForm({
        prophet_uncertainty_interval: config.prophet_uncertainty_interval,
        pyod_contamination_rate: config.pyod_contamination_rate,
      })
    }
  }, [config])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await onSave(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save model config:', err)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    config &&
    (form.prophet_uncertainty_interval !== config.prophet_uncertainty_interval ||
      form.pyod_contamination_rate !== config.pyod_contamination_rate)

  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 16 }}>Model Configuration</div>

      {/* Prophet Uncertainty */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Prophet Uncertainty Interval</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent-blue)', fontWeight: 600 }}>
            {form.prophet_uncertainty_interval.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0.50"
          max="0.99"
          step="0.01"
          value={form.prophet_uncertainty_interval}
          onChange={(e) => setForm({ ...form, prophet_uncertainty_interval: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent-blue)', background: 'transparent', border: 'none', padding: 0 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)' }}>0.50 (sensitive)</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)' }}>0.99 (permissive)</span>
        </div>
      </div>

      {/* PyOD Contamination */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>PyOD Contamination Rate</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent-orange)', fontWeight: 600 }}>
            {form.pyod_contamination_rate.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0.01"
          max="0.50"
          step="0.01"
          value={form.pyod_contamination_rate}
          onChange={(e) => setForm({ ...form, pyod_contamination_rate: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent-orange)', background: 'transparent', border: 'none', padding: 0 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)' }}>0.01 (few outliers)</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)' }}>0.50 (many outliers)</span>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{
            padding: '8px 20px',
            background: !hasChanges ? 'var(--bg-interactive-disabled)' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            borderRadius: 'var(--radius-md)',
            color: !hasChanges ? 'var(--text-ghost)' : '#fff',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {saving ? 'Saving...' : 'Apply Changes'}
        </button>
        {saved && (
          <span className="mono animate-fade-in" style={{ fontSize: 11, color: 'var(--accent-green)' }}>
            ✓ Configuration saved
          </span>
        )}
      </div>
    </div>
  )
}
