export default function Footer({ serviceHealth }) {
  const services = [
    { key: 'compositor', label: 'Compositor' },
    { key: 'oam', label: 'OAM' },
    { key: 'notification', label: 'Notification' },
    { key: 'anomaly', label: 'Anomaly' },
  ]

  const statusSymbol = (status) => {
    switch (status) {
      case 'healthy': return { char: '●', color: 'var(--accent-green)' }
      case 'degraded': return { char: '◐', color: 'var(--accent-yellow)' }
      case 'down': return { char: '○', color: 'var(--accent-red)' }
      default: return { char: '·', color: 'var(--text-ghost)' }
    }
  }

  return (
    <footer
      style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--border-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 10, color: 'var(--text-invisible)' }}
      >
        Compositor v1.0.0 · SOA IoT Gateway
      </span>

      <div style={{ display: 'flex', gap: 16 }}>
        {services.map((s) => {
          const health = serviceHealth?.[s.key]
          const sym = statusSymbol(health?.status)
          return (
            <span
              key={s.key}
              className="mono"
              style={{ fontSize: 10, color: sym.color }}
            >
              {s.label} {sym.char}
            </span>
          )
        })}
      </div>
    </footer>
  )
}
