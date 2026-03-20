import React from 'react'
import ReactDOM from 'react-dom/client'
import { ReactKeycloakProvider } from '@react-keycloak/web'
import keycloak, { initOptions } from './config/keycloak'
import App from './App'
import './styles/global.css'

const isPublicPreferencesRoute = window.location.pathname.startsWith('/preferences')

// ─── Keycloak Event Logger (dev only) ───────────────────────────────────────
const onKeycloakEvent = (event, error) => {
  if (import.meta.env.DEV) {
    console.log('[Keycloak]', event, error || '')
  }
}

const onKeycloakTokens = (tokens) => {
  if (import.meta.env.DEV) {
    console.log('[Keycloak] Token refreshed')
  }
}

// ─── Render ─────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isPublicPreferencesRoute ? (
      <App />
    ) : (
      <ReactKeycloakProvider
        authClient={keycloak}
        initOptions={initOptions}
        onEvent={onKeycloakEvent}
        onTokens={onKeycloakTokens}
        LoadingComponent={<LoadingScreen />}
      >
        <App />
      </ReactKeycloakProvider>
    )}
  </React.StrictMode>
)

// ─── Loading Screen (shown while Keycloak initializes) ──────────────────────
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
      <span
        style={{
          fontSize: 12,
          color: '#666',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1,
        }}
      >
        Initializing...
      </span>
    </div>
  )
}
