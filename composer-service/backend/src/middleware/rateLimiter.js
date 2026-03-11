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
})

export default limiter
