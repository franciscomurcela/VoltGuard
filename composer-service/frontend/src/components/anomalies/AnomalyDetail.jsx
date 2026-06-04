export default function AnomalyDetail({ anomaly, onClose }) {
  if (!anomaly) return null

  const confidencePercent = Math.round((anomaly.confidence_score || 0) * 100)
  const confidenceColor = confidencePercent > 85 ? 'var(--accent-red)' : confidencePercent > 70 ? 'var(--accent-yellow)' : 'var(--accent-green)'

  const formatMetricValue = (value) => {
    if (typeof value === 'number') return value.toFixed(2)
    if (value && typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div
      className="animate-scale-in"
      style={{
        padding: 24,
        background: 'rgba(239,68,68,0.04)',
        border: '1px solid rgba(239,68,68,0.12)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Anomaly Detail
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
            {anomaly.anomaly_id} · {anomaly.source_id}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '4px 12px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-faint)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Detection Info */}
        <div>
          <div className="label" style={{ marginBottom: 10, fontSize: 9 }}>Detection</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Method</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 500 }}>
                {anomaly.detection_method}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confidence</span>
              <span className="mono" style={{ fontSize: 12, color: confidenceColor, fontWeight: 600 }}>
                {confidencePercent}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Metric</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 600 }}>
                {anomaly.metric_name || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Severity</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent-orange)', fontWeight: 600 }}>
                {(anomaly.severity || '—').toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Detected</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {new Date(anomaly.timestamp).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Confidence bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ width: '100%', height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${confidencePercent}%`, height: '100%', background: confidenceColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        </div>

        {/* Trigger Metrics */}
        <div>
          <div className="label" style={{ marginBottom: 10, fontSize: 9 }}>Trigger Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(anomaly.trigger_metrics || {}).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {formatMetricValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
