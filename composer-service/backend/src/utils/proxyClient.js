import axios from 'axios'
import config from '../config/services.js'
import logger from './logger.js'
import { randomUUID } from 'crypto'

// ─── Single Shared Axios Client ─────────────────────────────────────────────
// Previously each proxy file created its own axios.create() and duplicated
// authHeaders(). Now everything goes through one client with interceptors.

const client = axios.create({
  timeout: config.proxy.timeout,
  headers: { 'X-Forwarded-By': 'compositor' },
})

// Request interceptor: attach correlation ID for tracing across services
client.interceptors.request.use((reqConfig) => {
  if (!reqConfig.headers['X-Correlation-ID']) {
    reqConfig.headers['X-Correlation-ID'] = randomUUID()
  }
  return reqConfig
})

// Response interceptor: log slow upstream calls
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const duration = error.config?._startTime ? Date.now() - error.config._startTime : null
    logger.debug({
      url: error.config?.url,
      status: error.response?.status,
      duration,
      code: error.code,
    }, 'Upstream request failed')
    return Promise.reject(error)
  }
)

// Timing interceptor
client.interceptors.request.use((reqConfig) => {
  reqConfig._startTime = Date.now()
  return reqConfig
})

/**
 * Build headers that forward the user's bearer token + correlation ID.
 * @param {import('express').Request} req
 * @returns {object} headers
 */
export function forwardHeaders(req) {
  const headers = {}
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization
  }
  // Propagate or generate correlation ID
  headers['X-Correlation-ID'] = req.headers['x-correlation-id'] || randomUUID()
  return headers
}

/**
 * Retry wrapper for transient upstream failures.
 * Retries on 5xx, timeouts, and connection errors. Never retries 4xx.
 *
 * @param {Function} fn - async function to retry
 * @param {object} opts
 * @param {number} opts.retries - max retries (default from config)
 * @param {number} opts.delay - base delay in ms (default from config)
 * @param {string} opts.label - service name for logging
 */
export async function withRetry(fn, { retries, delay, label } = {}) {
  const maxRetries = retries ?? config.proxy.retries
  const baseDelay = delay ?? config.proxy.retryDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isLast = attempt === maxRetries
      const status = err.response?.status
      const isRetryable = !status || status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED'

      if (isLast || !isRetryable) throw err

      const waitMs = baseDelay * (attempt + 1)
      logger.warn({
        attempt: attempt + 1,
        maxRetries,
        code: err.code,
        status,
        service: label || 'unknown',
        waitMs,
      }, 'Upstream request failed, retrying...')

      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
}

export default client
