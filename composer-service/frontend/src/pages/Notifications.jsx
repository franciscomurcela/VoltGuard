import { useState } from 'react'
import useNotifications from '../hooks/useNotifications'
import NotificationTable from '../components/notifications/NotificationTable'

// ─── Channel options derived from notificationProxy CLIENT_ID patterns ───────
const CHANNELS = [
  { value: 'twilio_sms',       label: '💬 SMS (Twilio)' },
  { value: 'twilio_whatsapp',  label: '📱 WhatsApp (Twilio)' },
  { value: 'email',            label: '✉️  Email' },
  { value: 'sendgrid',         label: '✉️  Email (SendGrid)' },
]

const ALERT_TYPES = [
  { value: 'critical', label: 'Critical' },
  { value: 'warnings', label: 'Warning' },
]

const EMPTY_FORM = { target: '', channel: 'twilio_sms', alert_type: 'critical', message_template: '' }

// ─── Send Form Panel ─────────────────────────────────────────────────────────
function SendNotificationPanel({ onSend, sending, sendError, lastSent, onDismissResult }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [validationError, setValidationError] = useState('')

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setValidationError('')
  }

  const handleSend = async () => {
    if (!form.target.trim()) return setValidationError('Target is required.')
    if (!form.message_template.trim()) return setValidationError('Message template is required.')

    try {
      await onSend({
        target: form.target.trim(),
        channel: form.channel,
        alert_type: form.alert_type,
        message_template: form.message_template.trim(),
      })
      setForm(EMPTY_FORM)
    } catch {
      // error is shown via sendError from hook
    }
  }

  const isEmail = form.channel === 'email' || form.channel === 'sendgrid'
  const targetPlaceholder = isEmail ? 'ops@voltguard.pt' : '+351910000000'
  const targetLabel = isEmail ? 'Email address' : 'Phone number'

  return (
    <div
      style={{
        marginBottom: 24,
        padding: '22px 24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div className="label" style={{ marginBottom: 18 }}>Send Notification</div>

      {/* Success result */}
      {lastSent && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
              ✓ Notification queued
            </span>
            {lastSent.id && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 10 }}>
                {lastSent.id}
              </span>
            )}
            {lastSent.status && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 10 }}>
                · {lastSent.status}
              </span>
            )}
          </div>
          <button
            onClick={onDismissResult}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Error */}
      {(sendError || validationError) && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--accent-red-dim)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-red)',
          }}
        >
          ⚠ {validationError || sendError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Channel */}
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Channel
          </div>
          <select
            value={form.channel}
            onChange={(e) => set('channel', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg-root)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Alert type */}
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Alert Type
          </div>
          <div style={{ display: 'flex', gap: 8, height: 36 }}>
            {ALERT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => set('alert_type', t.value)}
                style={{
                  flex: 1,
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: form.alert_type === t.value
                    ? (t.value === 'critical' ? 'var(--accent-red-dim)' : 'rgba(234,179,8,0.12)')
                    : 'var(--bg-root)',
                  border: `1px solid ${form.alert_type === t.value
                    ? (t.value === 'critical' ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)')
                    : 'var(--border-subtle)'}`,
                  color: form.alert_type === t.value
                    ? (t.value === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)')
                    : 'var(--text-faint)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target */}
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {targetLabel}
          </div>
          <input
            value={form.target}
            onChange={(e) => set('target', e.target.value)}
            placeholder={targetPlaceholder}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg-root)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Message template */}
      <div style={{ marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Message Template
        </div>
        <textarea
          value={form.message_template}
          onChange={(e) => set('message_template', e.target.value)}
          placeholder="Alerta Crítico na subestação A."
          rows={2}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg-root)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            padding: '9px 24px',
            background: sending ? 'var(--bg-root)' : 'var(--accent-blue-dim)',
            border: '1px solid rgba(14,165,233,0.25)',
            borderRadius: 'var(--radius-md)',
            color: sending ? 'var(--text-faint)' : 'var(--accent-blue)',
            fontSize: 13,
            fontWeight: 500,
            cursor: sending ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'Sending…' : '↑ Send Notification'}
        </button>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Notifications() {
  const {
    notifications,
    stats,
    loading,
    error,
    refetch,
    sendNotification,
    sending,
    sendError,
    lastSent,
    clearSendError,
    clearLastSent,
  } = useNotifications()

  const [showSendPanel, setShowSendPanel] = useState(false)

  const handleDismissResult = () => {
    clearLastSent()
    clearSendError()
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            Notification History
          </h2>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            {stats.total} sent · {stats.delivered} delivered · {stats.failed} failed · {stats.pending} pending
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={refetch}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-faint)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ↺ Refresh
          </button>
          <button
            onClick={() => {
              setShowSendPanel((v) => !v)
              handleDismissResult()
            }}
            style={{
              padding: '9px 22px',
              background: showSendPanel ? 'var(--accent-red-dim)' : 'var(--accent-blue-dim)',
              border: `1px solid ${showSendPanel ? 'rgba(239,68,68,0.25)' : 'rgba(14,165,233,0.25)'}`,
              borderRadius: 'var(--radius-md)',
              color: showSendPanel ? 'var(--accent-red)' : 'var(--accent-blue)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showSendPanel ? 'Cancel' : '+ Send Notification'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total',     value: stats.total,     color: 'var(--accent-blue)'   },
          { label: 'Delivered', value: stats.delivered, color: 'var(--accent-green)'  },
          { label: 'Failed',    value: stats.failed,    color: 'var(--accent-red)'    },
          { label: 'Pending',   value: stats.pending,   color: 'var(--accent-yellow)' },
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

      {/* Fetch error */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--accent-red-dim)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-red)',
          }}
        >
          ⚠ Failed to load notifications: {error}
        </div>
      )}

      {/* Send Panel */}
      {showSendPanel && (
        <SendNotificationPanel
          onSend={sendNotification}
          sending={sending}
          sendError={sendError}
          lastSent={lastSent}
          onDismissResult={handleDismissResult}
        />
      )}

      {/* History Table */}
      <NotificationTable notifications={notifications} />
    </div>
  )
}
