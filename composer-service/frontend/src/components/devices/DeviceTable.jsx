const STATUS_COLORS = {
  active: 'var(--accent-green)',
  warning: 'var(--accent-yellow)',
  inactive: 'var(--text-faint)',
  pending: 'var(--accent-blue)',
}

/**
 * Convert an ISO timestamp or relative string to a human-readable "Xs ago" format.
 */
function timeAgo(value) {
  if (!value) return '—'

  // If it's already a relative string like "2s ago", return as-is
  if (typeof value === 'string' && value.includes('ago')) return value

  // Try to parse as ISO timestamp
  const date = new Date(value)
  if (isNaN(date.getTime())) return value // Not a valid date, return raw

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Determine if a sensor should be considered "stale" (no keepalive recently).
 */
function isStale(lastSeen, thresholdMs = 120000) {
  if (!lastSeen) return true
  const date = new Date(lastSeen)
  if (isNaN(date.getTime())) return false // Can't parse, don't override
  return (Date.now() - date.getTime()) > thresholdMs
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
        No sensors registered yet.
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
            {['Status', 'ID', 'Name', 'District', 'Firmware', 'Last Seen', 'Pending Action', ''].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((device, i) => {
            const stale = isStale(device.lastSeen)
            // Override status to inactive if sensor hasn't been seen recently
            const effectiveStatus = (device.status === 'active' && stale) ? 'inactive' : device.status
            const statusColor = STATUS_COLORS[effectiveStatus] || 'var(--text-ghost)'

            return (
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
                    background: statusColor,
                    boxShadow: `0 0 6px ${statusColor}50`,
                  }}
                />
              </td>

              {/* ID */}
              <td>
                <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {device.id?.substring(0, 8)}...
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

              {/* Firmware (UUID from OAM) */}
              <td>
                <span className="mono" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>
                  {device.firmware
                    ? `${device.firmware.substring(0, 8)}...`
                    : '—'}
                </span>
              </td>

              {/* Last seen (ultimo_keepalive from OAM) */}
              <td>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: effectiveStatus === 'active' ? 'var(--accent-green)' : stale ? 'var(--accent-red)' : 'var(--text-faint)',
                  }}
                >
                  {timeAgo(device.lastSeen)}
                </span>
              </td>

              {/* Pending Action */}
              <td>
                {device.pendingAction && device.pendingAction !== 'NONE' ? (
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--accent-yellow)',
                      padding: '2px 8px',
                      background: 'var(--accent-yellow-dim)',
                      borderRadius: 'var(--radius-sm)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {device.pendingAction}
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>—</span>
                )}
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
