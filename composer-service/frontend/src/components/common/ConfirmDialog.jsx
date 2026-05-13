import { useEffect, useState } from 'react'

/**
 * Two-step destructive-action confirmation modal.
 *
 * The user must type the literal `confirmPhrase` (default: "DELETE") into the
 * input box AND click the red action button. The button is disabled until the
 * phrase matches exactly — that's the "double check".
 *
 * Props:
 *   open            (bool)   — show / hide the modal
 *   title           (string) — dialog header
 *   description     (node)   — body copy (can include <strong>/<ul>/etc.)
 *   confirmPhrase   (string) — text the user must type to enable the button
 *   confirmLabel    (string) — button label, default "Delete"
 *   onConfirm       (fn)     — called when the user confirms; can return a Promise
 *   onCancel        (fn)     — called when the user cancels / closes
 *   busy            (bool)   — shows spinner state on the action button (parent-owned)
 */
export default function ConfirmDialog({
  open,
  title = 'Confirm action',
  description,
  confirmPhrase = 'DELETE',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  busy = false,
}) {
  const [typed, setTyped] = useState('')

  // Reset typed text when dialog opens/closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  // ESC to cancel.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const phraseOk = typed === confirmPhrase

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        className="animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '90vw',
          padding: 32,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
            fontWeight: 700, fontSize: 18,
          }}>!</span>
          <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h2>
        </div>

        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.55 }}>
          {description}
        </div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Type <strong style={{ color: 'var(--text-primary)' }}>{confirmPhrase}</strong> to confirm:
        </label>
        <input
          type="text"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--bg-root)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'var(--font-mono)',
            marginBottom: 20,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={() => onCancel?.()}
            disabled={busy}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.()}
            disabled={!phraseOk || busy}
            style={{
              padding: '10px 16px',
              background: phraseOk && !busy
                ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                : 'rgba(239, 68, 68, 0.25)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: (!phraseOk || busy) ? 'not-allowed' : 'pointer',
              minWidth: 110,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
