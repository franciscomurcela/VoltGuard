import keycloak from '../config/keycloak.js'
import logger from '../utils/logger.js'

const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true'

if (AUTH_DISABLED) {
  logger.warn('AUTH_DISABLED=true — all auth checks bypassed (dev mode)')
}

/**
 * Require a valid Keycloak bearer token.
 * Attaches decoded token to req.kauth.grant
 */
export const requireAuth = AUTH_DISABLED
  ? (req, res, next) => next()
  : keycloak.protect()

/**
 * Require a specific realm or client role.
 * Usage: requireRole('admin') or requireRole('realm:admin')
 */
export function requireRole(role) {
  if (AUTH_DISABLED) return (req, res, next) => next()
  return keycloak.protect((token) => {
    // Check realm roles
    if (token.hasRealmRole(role)) return true
    // Check client roles
    if (token.hasRole(role)) return true

    logger.warn({ role, user: token.content?.preferred_username }, 'Access denied — insufficient role')
    return false
  })
}

/**
 * Optional auth — attaches user info if token present, but doesn't block.
 * Useful for endpoints that behave differently for authed vs anonymous users.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null
    return next()
  }

  // Let keycloak.protect() handle it, but catch failures
  keycloak.protect()(req, res, (err) => {
    if (err) {
      req.user = null
    }
    next()
  })
}

/**
 * Extract user info from a validated Keycloak token.
 * Call after requireAuth or requireRole.
 */
export function extractUser(req) {
  const grant = req.kauth?.grant
  if (!grant) return null

  const token = grant.access_token?.content
  if (!token) return null

  return {
    id: token.sub,
    email: token.email || token.preferred_username,
    name: token.name || token.preferred_username,
    roles: token.realm_access?.roles || [],
    isAdmin: token.realm_access?.roles?.includes('admin') || false,
  }
}
