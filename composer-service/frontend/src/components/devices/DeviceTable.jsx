const STATUS_COLORS = {
  active: 'var(--accent-green)',
  warning: 'var(--accent-yellow)',
  inactive: 'var(--text-faint)',
  pending: 'var(--accent-blue)',
}

const PENDING_ACTION_LABELS = {
  UPDATE_FIRMWARE: 'FW Update',
  REBOOT: 'Reboot',
  CLEAR_ANOMALY: 'Clear Anomaly',
}

export default function DeviceTable({ devices = [], onDelete }) {
  if (!devices.length) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: 'var(--text-ghost)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
        }}
      >
        No devices registered yet.
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <table>
        <thead>
          <tr>
            {['Status', 'ID', 'Name', 'District', 'Pending Action', 'Firmware', 'Last Seen', ''].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((device, i) => (
            <tr
              key={device.id}
              className="animate-slide-left"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Status dot */}
              <td>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLORS[device.status] || 'var(--text-ghost)',
                    boxShadow: `0 0 6px ${STATUS_COLORS[device.status] || 'transparent'}50`,
                  }}
                />
              </td>

              {/* ID */}
              <td>
                <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {device.id ? device.id.slice(0, 8) + '…' : '—'}
                </span>
              </td>

              {/* Name */}
              <td>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {device.name}
                </span>
              </td>

              {/* District */}
              <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {device.district}
              </td>

              {/* Pending Action */}
              <td>
                {device.pendingAction ? (
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      background: 'rgba(234,179,8,0.12)',
                      border: '1px solid rgba(234,179,8,0.2)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-yellow)',
                    }}
                  >
                    {PENDING_ACTION_LABELS[device.pendingAction] || device.pendingAction}
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>—</span>
                )}
              </td>

              {/* Firmware */}
              <td>
                <span className="mono" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>
                  {device.firmware === 'none' ? '—' : device.firmware ? device.firmware.slice(0, 8) + '…' : '—'}
                </span>
              </td>

              {/* Last seen */}
              <td>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: device.status === 'active' ? 'var(--accent-green)' : 'var(--text-faint)',
                  }}
                >
                  {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                </span>
              </td>

              {/* Actions */}
              <td style={{ textAlign: 'right' }}>
                {onDelete && (
                  <button
                    onClick={() => onDelete(device.id)}
                    style={{
                      padding: '3px 8px',
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.15)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-red)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => (e.target.style.opacity = 1)}
                    onMouseLeave={(e) => (e.target.style.opacity = 0.5)}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
