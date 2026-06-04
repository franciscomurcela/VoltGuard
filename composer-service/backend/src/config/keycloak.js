import Keycloak from 'keycloak-connect'
import session from 'express-session'
import logger from '../utils/logger.js'

// ─── TLS override ───────────────────────────────────────────────────────────
// Needed when Keycloak is behind a TLS terminator with an institutional cert
// that is not in Node's built-in CA bundle (e.g. university infrastructure).
// Set KEYCLOAK_SKIP_TLS_VERIFY=true in the deployment env to enable.
if (process.env.KEYCLOAK_SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  logger.warn('TLS certificate verification disabled (KEYCLOAK_SKIP_TLS_VERIFY=true)')
}

// ─── Session Store (required by keycloak-connect) ───────────────────────────
const memoryStore = new session.MemoryStore()

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'compositor-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: memoryStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000,
  },
})

// ─── Keycloak Instance ──────────────────────────────────────────────────────
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'iot-compositor',
  'auth-server-url': process.env.KEYCLOAK_URL || 'http://localhost:8081',
  'ssl-required': process.env.KEYCLOAK_SSL_REQUIRED || (process.env.NODE_ENV === 'production' ? 'external' : 'none'),
  resource: process.env.KEYCLOAK_CLIENT_ID || 'compositor-backend',
  credentials: {
    secret: process.env.KEYCLOAK_CLIENT_SECRET || 'change-me-in-production',
  },
  'confidential-port': 0,
  'bearer-only': true,
}

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig)

logger.info(
  { realm: keycloakConfig.realm, url: keycloakConfig['auth-server-url'], sslRequired: keycloakConfig['ssl-required'] },
  'Keycloak configured (bearer-only)'
)

export default keycloak
