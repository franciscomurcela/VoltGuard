import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { load } from 'js-yaml'
import swaggerUi from 'swagger-ui-express'
import keycloak from './config/keycloak.js'
import { sessionMiddleware } from './config/keycloak.js'
import config from './config/services.js'
import logger from './utils/logger.js'
import rateLimiter from './middleware/rateLimiter.js'
import errorHandler from './middleware/errorHandler.js'
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js'
import { initDatabase, cachePurge, closeDatabase } from './config/database.js'
import healthRoutes from './routes/health.js'
import deviceRoutes from './routes/devices.js'
import metricsRoutes from './routes/metrics.js'
import districtRoutes from './routes/districts.js'
import notificationRoutes from './routes/notifications.js'
import anomalyRoutes from './routes/anomalies.js'
import firmwareRoutes from './routes/firmwares.js'
import preferencesRoutes from './routes/preferences.js'
import measurementRoutes from './routes/measurements.js'
import webhookRoutes from './routes/webhooks.js'
import dashboardRoutes from './routes/dashboard.js'
import { registerAnomalyWebhook } from './services/webhookRegistration.js'
import { processDigest } from './services/notificationProxy.js'

// ─── Docs setup ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const spec = load(readFileSync(join(__dirname, 'docs/openapi.yaml'), 'utf8'))

const app = express()

// ─── Global Middleware ───────────────────────────────────────────────────────
// Disable CSP so Swagger UI can load its CDN assets (css/js)
app.use(helmet({ contentSecurityPolicy: false }))

// Correlation ID — essential for tracing requests across SOA services
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || randomUUID()
  res.setHeader('X-Correlation-ID', req.correlationId)
  next()
})

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}))

app.use(express.json({ limit: '1mb' }))

app.use(morgan('short', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}))

app.use(sessionMiddleware)
app.use(keycloak.middleware())
app.use(rateLimiter)
// Metrics middleware should be early to capture requests
app.use(metricsMiddleware)

// ─── API Docs (no auth — public) ────────────────────────────────────────────
// Raw YAML spec — consumed by the multi-spec dropdown and external tools
app.get('/api-docs/openapi.yaml', (req, res) => {
  res.setHeader('Content-Type', 'application/yaml')
  res.sendFile(join(__dirname, 'docs/openapi.yaml'))
})

// Swagger UI — shows Composer API + OAM Service tabs
app.use(
  '/swagger-ui',
  swaggerUi.serve,
  swaggerUi.setup(spec, {
    customSiteTitle: 'VoltGuard API Docs',
    explorer: true,
    swaggerOptions: {
      urls: [
        { name: 'Composer API',  url: '/api-docs/openapi.yaml' },
        { name: 'OAM Service',   url: 'http://oam.voltguard.pt/api-docs/openapi.json' },
      ],
      'urls.primaryName': 'Composer API',
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    },
  })
)

// ─── Routes ─────────────────────────────────────────────────────────────────-
// Health routes are public (no auth) — K8s probes need unauthenticated access
app.use('/api/health', healthRoutes)
// Prometheus metrics endpoint (root path) — Prometheus will scrape this
app.get('/metrics', metricsHandler)
app.use('/api/public', preferencesRoutes)
// Internal webhook receiver — called by peer services, no user auth
app.use('/api/webhooks', webhookRoutes)

// Protected routes
app.use('/api/devices', deviceRoutes)
app.use('/api/metrics', metricsRoutes)
app.use('/api/districts', districtRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/anomalies', anomalyRoutes)
app.use('/api/measurements', measurementRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/firmwares', firmwareRoutes)

// ─── 404 ─────────────────────────────────────────────────────────────────----
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `No route matches ${req.method} ${req.path}`,
  })
})

// ─── Error Handler ─────────────────────────────────────────────────────────---
app.use(errorHandler)

// ─── Start ─────────────────────────────────────────────────────────────────--
const PORT = config.server.port

export async function start() {
  await initDatabase()

  // Register compositor as webhook consumer on the anomaly service.
  // Non-blocking — a failed registration only means automatic notifications
  // won't fire until the next restart, not that the server can't start.
  registerAnomalyWebhook().catch((err) =>
    logger.warn({ err: err.message }, 'Anomaly webhook registration failed on startup'),
  )

  // Periodically flush the notifications digest queue.
  // Defaults to every hour; override with DIGEST_INTERVAL_MS env var.
  const digestIntervalMs = parseInt(process.env.DIGEST_INTERVAL_MS, 10) || 3600000
  const digestInterval = setInterval(async () => {
    try {
      const result = await processDigest({ batchSize: 50 })
      if (result.queued_found > 0) {
        logger.info({ result }, 'Digest queue flushed')
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Digest queue flush failed')
    }
  }, digestIntervalMs)
  logger.info({ intervalMs: digestIntervalMs }, 'Digest scheduler started')

  const purgeInterval = setInterval(cachePurge, 60000)

  const server = app.listen(PORT, () => {
    logger.info({
      port: PORT,
      env: config.server.env,
      docs: `http://localhost:${PORT}/swagger-ui/`,
      services: {
        oam:          process.env.OAM_SERVICE_URL          || 'http://localhost:8081',
        notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8082',
        anomaly:      process.env.ANOMALY_SERVICE_URL       || 'http://localhost:8083',
      },
    }, `Compositor backend listening on :${PORT}`)
  })

  // Graceful shutdown (K8s sends SIGTERM)
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down...')
    clearInterval(purgeInterval)
    clearInterval(digestInterval)
    server.close(() => {
      closeDatabase()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

export default app
