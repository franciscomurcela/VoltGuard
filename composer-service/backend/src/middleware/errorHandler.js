import logger from '../utils/logger.js'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Catch-all error handler.
 * Must have 4 params so Express recognizes it as error middleware.
 */
export default function errorHandler(err, req, res, _next) {
  // Prevent double-send if headers already sent
  if (res.headersSent) {
    return _next(err)
  }

  // Axios errors from proxy calls
  if (err.isAxiosError) {
    const upstreamStatus = err.response?.status
    const status = upstreamStatus || 502
    const internalUrl = err.config?.url || 'unknown'

    logger.error(
      { status, url: internalUrl, code: err.code, method: err.config?.method },
      'Upstream service error'
    )

    // Never expose internal URLs to the client
    return res.status(status).json({
      error: 'Upstream service error',
      message: status === 504 || err.code === 'ECONNABORTED'
        ? 'Upstream service timed out'
        : err.code === 'ECONNREFUSED'
          ? 'Upstream service unavailable'
          : `Upstream service returned an error`,
      // Only expose the service name in dev, never the URL
      ...(isDev && { _debug: { url: internalUrl, code: err.code } }),
    })
  }

  // Keycloak auth errors
  if (err.name === 'ForbiddenError' || err.status === 403) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Insufficient permissions for this resource',
    })
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message,
      details: err.details || undefined,
    })
  }

  // Default
  const status = err.status || err.statusCode || 500
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : 'Request error',
    message: isDev ? err.message : 'An unexpected error occurred',
  })
}
