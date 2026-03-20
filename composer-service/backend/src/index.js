import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { randomUUID } from 'crypto'

import keycloak from './config/keycloak.js'
import { sessionMiddleware } from './config/keycloak.js'
import config from './config/services.js'
import logger from './utils/logger.js'
import rateLimiter from './middleware/rateLimiter.js'
import errorHandler from './middleware/errorHandler.js'

import { initDatabase, cachePurge, cacheDelete, closeDatabase } from './config/database.js'
import healthRoutes from './routes/health.js'
import deviceRoutes from './routes/devices.js'
import metricsRoutes from './routes/metrics.js'
import districtRoutes from './routes/districts.js'
import notificationRoutes from './routes/notifications.js'
import anomalyRoutes from './routes/anomalies.js'
import firmwareRoutes from './routes/firmwares.js'
import preferencesRoutes from './routes/preferences.js'

const app = express()

// ─── Global Middleware ──────────────────────────────────────────────────────
app.use(helmet())

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

// ─── Routes ─────────────────────────────────────────────────────────────────
// Health routes are public (no auth) — K8s probes need unauthenticated access
app.use('/api/health', healthRoutes)
app.use('/api/public', preferencesRoutes)

// Protected routes
app.use('/api/devices', deviceRoutes)
app.use('/api/metrics', metricsRoutes)
app.use('/api/districts', districtRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/anomalies', anomalyRoutes)
app.use('/api/firmwares', firmwareRoutes)

// ─── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `No route matches ${req.method} ${req.path}`,
  })
})

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = config.server.port

async function start() {
  // Initialize local database (optional — runs in proxy-only mode if DB fails)
  await initDatabase()

  // Purge expired cache entries every 60 seconds
  const purgeInterval = setInterval(cachePurge, 60000)

  const server = app.listen(PORT, () => {
    logger.info({
      port: PORT,
      env: config.server.env,
      services: {
        oam: process.env.OAM_SERVICE_URL || 'http://localhost:8081',
        notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8082',
        anomaly: process.env.ANOMALY_SERVICE_URL || 'http://localhost:8083',
      },
    }, `Compositor backend listening on :${PORT}`)
  })

  // Graceful shutdown (K8s sends SIGTERM)
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down...')
    clearInterval(purgeInterval)
    server.close(() => {
      closeDatabase()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start()

export default app
