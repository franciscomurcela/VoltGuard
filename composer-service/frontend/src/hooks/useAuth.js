import { useEffect, useMemo } from 'react'
import { useKeycloakContext } from '../contexts/KeycloakContext'
import { setTokenGetter } from '../services/api'

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true'

// ─── Real auth — keycloak-js used directly via KeycloakContext ───────────────
function useRealAuth() {
  const { initialized, authenticated, keycloak } = useKeycloakContext()

  useEffect(() => {
    if (authenticated && keycloak?.token) {
      setTokenGetter(() => keycloak.token)
    }
  }, [keycloak?.token, authenticated])

  const user = useMemo(() => {
    if (!authenticated || !keycloak?.tokenParsed) return null

    const tp = keycloak.tokenParsed
    const realmRoles = tp.realm_access?.roles || []
    const clientRoles = tp.resource_access?.[keycloak.clientId]?.roles || []

    return {
      id: tp.sub,
      email: tp.email || tp.preferred_username || 'unknown',
      name: tp.name || tp.preferred_username || 'User',
      realm: keycloak.realm,
      roles: [...realmRoles, ...clientRoles],
      isAdmin: realmRoles.includes('admin') || clientRoles.includes('admin'),
    }
  }, [keycloak?.tokenParsed, authenticated])

  return {
    initialized,
    authenticated,
    user,
    token: keycloak?.token,
    login:   () => keycloak?.login(),
    logout:  () => keycloak?.logout({ redirectUri: window.location.origin }),
    hasRole: (role) => user?.roles.includes(role) || false,
  }
}

// ─── Mock auth — no Keycloak provider in the tree (AUTH_DISABLED=true) ───────
function useMockAuth() {
  return {
    initialized: true,
    authenticated: false,
    user: null,
    token: null,
    login:   () => {},
    logout:  () => {},
    hasRole: () => false,
  }
}

// AUTH_DISABLED is a build-time constant — the exported hook is always the same
// function reference, so React's rules of hooks are satisfied.
export default AUTH_DISABLED ? useMockAuth : useRealAuth
