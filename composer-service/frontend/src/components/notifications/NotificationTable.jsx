const STATUS_STYLES = {
  DELIVERED: { color: 'var(--accent-green)', bg: 'rgba(34,197,94,0.1)', label: 'Delivered' },
  failed: { color: 'var(--accent-red)', bg: 'rgba(239,68,68,0.1)', label: 'Failed' },
  PENDING: { color: 'var(--accent-yellow)', bg: 'rgba(234,179,8,0.1)', label: 'Pending' },
  SENT: { color: 'var(--accent-blue)', bg: 'rgba(14,165,233,0.1)', label: 'Sent' },
}

const CHANNEL_ICONS = {
  twilio_sms: '💬',
  twilio_whatsapp: '📱',
  email: '✉️',
  sendgrid: '✉️',
}

function formatTime(timestamp) {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}

export default function NotificationTable({ notifications = [] }) {
  if (!notifications.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        No notifications sent yet.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            {['Status', 'ID', 'Channel', 'Target', 'Client', 'Sent'].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notifications.map((notif, i) => {
            const statusStyle = STATUS_STYLES[notif.status] || STATUS_STYLES.PENDING
            return (
              <tr key={notif.id} className="animate-slide-left" style={{ animationDelay: `${i * 40}ms` }}>
                <td>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: statusStyle.color,
                      padding: '3px 10px',
                      background: statusStyle.bg,
                      borderRadius: 'var(--radius-sm)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      fontWeight: 600,
                    }}
                  >
                    {statusStyle.label}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                    {notif.id?.substring(0, 12)}...
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {CHANNEL_ICONS[notif.channel] || '📨'} {notif.channel || '—'}
                </td>
                <td>
                  <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {notif.target || '—'}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                    {notif.client_id || '—'}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {formatTime(notif.created_at)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
