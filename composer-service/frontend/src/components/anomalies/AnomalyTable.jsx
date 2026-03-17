const SEVERITY_COLORS = {
  critical: { bg: 'rgba(239,68,68,0.15)', text: 'var(--accent-red)', border: 'rgba(239,68,68,0.3)' },
  high: { bg: 'rgba(249,115,22,0.12)', text: 'var(--accent-orange)', border: 'rgba(249,115,22,0.25)' },
  medium: { bg: 'rgba(234,179,8,0.12)', text: 'var(--accent-yellow)', border: 'rgba(234,179,8,0.25)' },
  low: { bg: 'rgba(14,165,233,0.1)', text: 'var(--accent-blue)', border: 'rgba(14,165,233,0.2)' },
}

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AnomalyTable({ anomalies = [], onSelect }) {
  const items = anomalies.items || anomalies

  if (!items.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        No anomalies detected.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            {['Severity', 'Anomaly ID', 'Source', 'Detected', ''].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((anomaly, i) => {
            const sev = SEVERITY_COLORS[anomaly.severity] || SEVERITY_COLORS.medium
            return (
              <tr
                key={anomaly.anomaly_id}
                className="animate-slide-left"
                style={{ animationDelay: `${i * 40}ms`, cursor: onSelect ? 'pointer' : 'default' }}
                onClick={() => onSelect?.(anomaly.anomaly_id)}
              >
                <td>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: sev.text,
                      padding: '3px 10px',
                      background: sev.bg,
                      border: `1px solid ${sev.border}`,
                      borderRadius: 'var(--radius-sm)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      fontWeight: 600,
                    }}
                  >
                    {anomaly.severity || 'medium'}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {anomaly.anomaly_id}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
                    {anomaly.source_id}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {timeAgo(anomaly.timestamp)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {onSelect && (
                    <span style={{ fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer' }}>
                      Detail →
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
