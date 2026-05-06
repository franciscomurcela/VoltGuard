import client from 'prom-client'

const register = new client.Registry()

// Collect default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register })

// HTTP request duration histogram
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

// Total requests counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
})

function metricsMiddleware(req, res, next) {
  const end = httpRequestDurationSeconds.startTimer()
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path
    const labels = { method: req.method, route, status_code: res.statusCode }
    httpRequestsTotal.labels(labels.method, labels.route, String(labels.status_code)).inc()
    end({ method: labels.method, route: labels.route, status_code: String(labels.status_code) })
  })
  next()
}

async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', register.contentType)
    const metrics = await register.metrics()
    res.send(metrics)
  } catch (err) {
    res.status(500).send(err.message)
  }
}

export { metricsMiddleware, metricsHandler }
