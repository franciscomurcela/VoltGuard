import useNotifications from '../hooks/useNotifications'
import NotificationTable from '../components/notifications/NotificationTable'

export default function Notifications() {
  const { notifications, stats, loading } = useNotifications()

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 13, color: 'var(--text-faint)', animation: 'pulse 2s ease infinite' }}>
          Loading notification history...
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          Notification History
        </h2>
        <p className="mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
          {stats.total} notifications sent · {stats.delivered} delivered · {stats.failed} failed
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Delivered', value: stats.delivered, color: 'var(--accent-green)' },
          { label: 'Failed', value: stats.failed, color: 'var(--accent-red)' },
          { label: 'Pending', value: stats.pending, color: 'var(--accent-yellow)' },
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

      {/* Table */}
      <NotificationTable notifications={notifications} />
    </div>
  )
}
