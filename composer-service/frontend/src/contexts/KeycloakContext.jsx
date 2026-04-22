import { createContext, useContext, useEffect, useRef, useState } from 'react'
import keycloak from '../config/keycloak'

const KeycloakContext = createContext(null)

export function KeycloakProvider({ children, loadingComponent = null }) {
  const [state, setState] = useState({ initialized: false, authenticated: false })
  const initCalled = useRef(false)

  useEffect(() => {
    if (initCalled.current) return
    initCalled.current = true

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.login())
    }

    keycloak
      .init({
        // check-sso resolves false gracefully (not reject) when unauthenticated,
        // leaving the keycloak instance with endpoints loaded so login() works.
        // We then redirect manually below, giving us a reliable PKCE flow.
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoFallback: false,
      })
      .then((authenticated) => {
        if (authenticated) {
          setState({ initialized: true, authenticated: true })
        } else {
          // Endpoints are now loaded — redirect to Keycloak login immediately.
          // The browser will come back with ?code=... and init() will exchange it.
          keycloak.login({ redirectUri: window.location.origin + '/' })
        }
      })
      .catch((err) => {
        console.error('[Keycloak] init error:', err)
        // Surface the login page so the user can retry manually
        setState({ initialized: true, authenticated: false })
      })
  }, [])

  if (!state.initialized) return loadingComponent

  return (
    <KeycloakContext.Provider value={{ ...state, keycloak }}>
      {children}
    </KeycloakContext.Provider>
  )
}

export function useKeycloakContext() {
  return useContext(KeycloakContext)
}
