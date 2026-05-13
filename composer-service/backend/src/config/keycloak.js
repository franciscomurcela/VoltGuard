import Keycloak from 'keycloak-connect'
import session from 'express-session'
import logger from '../utils/logger.js'

// ─── Session Store (required by keycloak-connect) ───────────────────────────
// In production, replace with a Redis-backed store (e.g. connect-redis) so
// sessions survive container restarts.
const memoryStore = new session.MemoryStore()

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'compositor-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: memoryStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000, // 1 hour
  },
})

// ─── Keycloak Instance ──────────────────────────────────────────────────────
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'iot-compositor',
  'auth-server-url': process.env.KEYCLOAK_URL || 'http://localhost:8081',
  'ssl-required': process.env.NODE_ENV === 'production' ? 'external' : 'none',
  resource: process.env.KEYCLOAK_CLIENT_ID || 'compositor-backend',
  credentials: {
    secret: process.env.KEYCLOAK_CLIENT_SECRET || 'change-me-in-production',
  },
  'confidential-port': 0,
  'bearer-only': true,  // Backend only validates tokens, never redirects to login
}

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig)

logger.info(
  { realm: keycloakConfig.realm, url: keycloakConfig['auth-server-url'] },
  'Keycloak configured (bearer-only)'
)

export default keycloak
