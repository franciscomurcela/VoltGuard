import React from 'react'
import ReactDOM from 'react-dom/client'
import { KeycloakProvider } from './contexts/KeycloakContext'
import App from './App'
import './styles/global.css'

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true'
const isPublicPreferencesRoute = window.location.pathname.startsWith('/preferences')

// Skip Keycloak entirely when auth is disabled or on public routes.
// keycloak-js is initialised directly in KeycloakContext (no @react-keycloak/web).
const needsProvider = !AUTH_DISABLED && !isPublicPreferencesRoute

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {needsProvider ? (
      <KeycloakProvider loadingComponent={<LoadingScreen />}>
        <App />
      </KeycloakProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
)

// ─── Loading Screen ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        fontFamily: "'IBM Plex Sans', sans-serif",
        gap: 20,
      }}
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <div
        style={{
          width: 28,
          height: 28,
          border: '2px solid rgba(255,255,255,0.06)',
          borderTop: '2px solid #0ea5e9',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 12, color: '#666', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
        Initializing...
      </span>
    </div>
  )
}
