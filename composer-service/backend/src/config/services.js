const config = {
  proxy: {
    timeout: parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 5000,
    retries: parseInt(process.env.PROXY_RETRY_COUNT, 10) || 2,
    retryDelay: parseInt(process.env.PROXY_RETRY_DELAY_MS, 10) || 500,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 8080,
    env: process.env.NODE_ENV || 'development',
  },
}

export default config
