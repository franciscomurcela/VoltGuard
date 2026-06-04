import rateLimit from 'express-rate-limit'
import config from '../config/services.js'

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please retry after the cooldown window.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  keyGenerator: (req) => {
    // Use Keycloak user ID if available, otherwise fall back to IP
    return req.kauth?.grant?.access_token?.content?.sub || req.ip
  },
  // Skip rate limiting for internal server-to-server traffic:
  //   /api/webhooks/*  → anomaly-api dispatches one webhook per detection;
  //                       during demos with the simulator this can burst into
  //                       the thousands and would otherwise hit the user-traffic
  //                       cap. These are authenticated by a static app token,
  //                       not a per-user JWT, so they can't easily be keyed.
  //   /api/health/*    → liveness/readiness probes.
  skip: (req) =>
    req.path.startsWith('/api/webhooks/') ||
    req.path.startsWith('/api/health/'),
})

export default limiter
