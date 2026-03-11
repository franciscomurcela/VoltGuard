import { useKeycloak } from '@react-keycloak/web'
import { useEffect, useMemo } from 'react'
import { setTokenGetter } from '../services/api'

export default function useAuth() {
  const { keycloak, initialized } = useKeycloak()

  // Wire the token into the API layer whenever it changes
  useEffect(() => {
    if (keycloak?.authenticated) {
      setTokenGetter(() => keycloak.token)
    }
  }, [keycloak?.token, keycloak?.authenticated])

  const user = useMemo(() => {
    if (!keycloak?.authenticated || !keycloak.tokenParsed) return null

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
  }, [keycloak?.tokenParsed, keycloak?.authenticated])

  return {
    initialized,
    authenticated: keycloak?.authenticated || false,
    user,
    token: keycloak?.token,
    login: () => keycloak?.login(),
    logout: () => keycloak?.logout({ redirectUri: window.location.origin }),
    hasRole: (role) => user?.roles.includes(role) || false,
  }
}
