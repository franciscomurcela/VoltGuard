import useAuth from '../hooks/useAuth'

export default function Login() {
  const { initialized, login } = useAuth()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-root)',
      }}
    >
      <div
        className="animate-fade-up"
        style={{
          width: 400,
          padding: 48,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          backdropFilter: 'blur(20px)',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
              COMPOSITOR
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 2 }}
          >
            IoT Service Gateway
          </div>
        </div>

        {/* Keycloak badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            background: 'var(--accent-blue-glow)',
            border: '1px solid rgba(14,165,233,0.15)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 32,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent-blue)' }}>
            Secured by Keycloak · OpenID Connect
          </span>
        </div>

        {/* Status / Action */}
        {!initialized ? (
          <div>
            <div
              style={{
                width: 32,
                height: 32,
                border: '2px solid var(--border-subtle)',
                borderTop: '2px solid var(--accent-blue)',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Connecting to Keycloak...
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Authentication is required to access the compositor dashboard.
            </p>
            <button
              onClick={login}
              style={{
                width: '100%',
                padding: '12px 0',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                borderRadius: 'var(--radius-md)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Sign In via Keycloak
            </button>
          </div>
        )}

        <div
          className="mono"
          style={{ marginTop: 28, fontSize: 10, color: 'var(--text-ghost)' }}
        >
          OAuth 2.0 · PKCE · RBAC
        </div>
      </div>
    </div>
  )
}
