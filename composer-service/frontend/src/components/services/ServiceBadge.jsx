const STATUS_COLORS = {
  healthy: 'var(--accent-green)',
  degraded: 'var(--accent-yellow)',
  down: 'var(--accent-red)',
  unknown: 'var(--text-ghost)',
}

const STATUS_LABELS = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
}

export default function ServiceBadge({ name, status = 'unknown', latency = null, description = '' }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-surface-hover)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        transition: 'border-color var(--transition-fast)',
      }}
    >
      {/* Status dot */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
        {status === 'healthy' && (
          <div
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `1px solid ${color}`,
              animation: 'gentlePulse 3s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Service info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            lineHeight: 1.3,
          }}
        >
          {name}
        </div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>

      {/* Status label */}
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: color,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          padding: '2px 8px',
          background: `${color}15`,
          borderRadius: 'var(--radius-sm)',
        }}
      >
        {STATUS_LABELS[status]}
      </div>

      {/* Latency */}
      {latency !== null && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: latency > 100 ? 'var(--accent-yellow)' : 'var(--text-faint)',
            minWidth: 45,
            textAlign: 'right',
          }}
        >
          {latency}ms
        </div>
      )}
    </div>
  )
}
