export default function Footer() {
  return (
    <footer
      style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--border-muted)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-invisible)' }}>
        Compositor v1.0.0 · SOA IoT Gateway
      </span>
    </footer>
  )
}
