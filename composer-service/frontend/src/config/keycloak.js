import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url:      import.meta.env.VITE_KEYCLOAK_URL    || 'http://auth.voltguard.pt',
  realm:    import.meta.env.VITE_KEYCLOAK_REALM  || 'iot-compositor',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT || 'compositor-frontend',
})

export default keycloak
