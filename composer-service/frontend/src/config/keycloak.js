import Keycloak from 'keycloak-js'

const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'iot-compositor',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT || 'compositor-frontend',
}

const keycloak = new Keycloak(keycloakConfig)

export const initOptions = {
  onLoad: 'login-required',
  checkLoginIframe: false,
  pkceMethod: 'S256',
}

export default keycloak
