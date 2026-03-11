import { useState, useEffect, useCallback, useRef } from 'react'
import { metricsApi, healthApi } from '../services/api'

// ─── Mock Data Generator (remove when backend is live) ──────────────────────
function generateMockMetrics() {
  const jitter = (base, pct = 0.05) => Math.floor(base * (1 + (Math.random() - 0.5) * 2 * pct))

  return {
    totalRequests: jitter(45843266),
    requestsPerSecond: jitter(172411),
    totalDeployments: jitter(6120),
    firewallActions: {
      total: jitter(7507933),
      systemBlocks: jitter(1398338),
      systemChallenges: jitter(3171579),
      customWafBlocks: jitter(328814),
    },
    botManagement: {
      botsBlocked: jitter(415722),
      humansVerified: jitter(2408348),
    },
    aiGateway: {
      requests: jitter(24088),
      avgLatency: jitter(142, 0.2),
    },
    cache: {
      hitsServed: jitter(28953177),
      hitRate: +(62 + Math.random() * 10).toFixed(1),
    },
    devicesOnline: jitter(2847),
    devicesTotal: 3124,
  }
}

function generateMockDistricts() {
  const base = [
    { id: 'lisboa', name: 'Lisboa', requests: 12456789, rate: 48221 },
    { id: 'porto', name: 'Porto', requests: 8945123, rate: 34108 },
    { id: 'setubal', name: 'Setúbal', requests: 4567890, rate: 17542 },
    { id: 'aveiro', name: 'Aveiro', requests: 3421890, rate: 13289 },
    { id: 'faro', name: 'Faro', requests: 3210987, rate: 12198 },
    { id: 'braga', name: 'Braga', requests: 2891045, rate: 10856 },
    { id: 'coimbra', name: 'Coimbra', requests: 2134567, rate: 8312 },
    { id: 'leiria', name: 'Leiria', requests: 1876543, rate: 7245 },
    { id: 'viseu', name: 'Viseu', requests: 1567890, rate: 5932 },
    { id: 'santarem', name: 'Santarém', requests: 1234567, rate: 4876 },
    { id: 'evora', name: 'Évora', requests: 987654, rate: 3821 },
    { id: 'viana', name: 'Viana do Castelo', requests: 1245032, rate: 4563 },
    { id: 'vila_real', name: 'Vila Real', requests: 876543, rate: 3254 },
    { id: 'castelo_branco', name: 'Castelo Branco', requests: 765432, rate: 2987 },
    { id: 'beja', name: 'Beja', requests: 654321, rate: 2543 },
    { id: 'braganca', name: 'Bragança', requests: 543210, rate: 2156 },
    { id: 'guarda', name: 'Guarda', requests: 432156, rate: 1843 },
    { id: 'portalegre', name: 'Portalegre', requests: 345678, rate: 1432 },
  ]

  return base.map((d) => ({
    ...d,
    requests: Math.floor(d.requests * (1 + (Math.random() - 0.5) * 0.06)),
    rate: Math.floor(d.rate * (1 + (Math.random() - 0.5) * 0.08)),
  }))
}

function generateMockHealth() {
  return {
    compositor: { status: 'healthy', latency: 8 + Math.floor(Math.random() * 10) },
    oam: { status: 'healthy', latency: 25 + Math.floor(Math.random() * 20) },
    notification: { status: 'healthy', latency: 20 + Math.floor(Math.random() * 18) },
    anomaly: {
      status: Math.random() > 0.3 ? 'degraded' : 'healthy',
      latency: 100 + Math.floor(Math.random() * 120),
    },
  }
}

function generateSparkline(length = 20) {
  const data = []
  let val = 50 + Math.random() * 50
  for (let i = 0; i < length; i++) {
    val += (Math.random() - 0.48) * 15
    val = Math.max(10, Math.min(100, val))
    data.push(Math.floor(val))
  }
  return data
}
// ─── End Mock ───────────────────────────────────────────────────────────────

const POLL_INTERVAL = 3000
const USE_MOCK = true // flip to false once backend is wired

export default function useMetrics() {
  const [metrics, setMetrics] = useState(null)
  const [districts, setDistricts] = useState([])
  const [serviceHealth, setServiceHealth] = useState(null)
  const [sparklines, setSparklines] = useState({
    requests: generateSparkline(),
    firewall: generateSparkline(),
    devices: generateSparkline(),
    cache: generateSparkline(),
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      if (USE_MOCK) {
        setMetrics(generateMockMetrics())
        setDistricts(generateMockDistricts())
        setServiceHealth(generateMockHealth())
        setSparklines((prev) => ({
          requests: [...prev.requests.slice(1), 30000 + Math.floor(Math.random() * 15000)],
          firewall: [...prev.firewall.slice(1), 1200 + Math.floor(Math.random() * 800)],
          devices: [...prev.devices.slice(1), 5000 + Math.floor(Math.random() * 3000)],
          cache: [...prev.cache.slice(1), 4000 + Math.floor(Math.random() * 4000)],
        }))
      } else {
        const [metricsRes, districtsRes, healthRes] = await Promise.all([
          metricsApi.getSummary(),
          metricsApi.getDistricts(),
          healthApi.check(),
        ])
        setMetrics(metricsRes.data)
        setDistricts(districtsRes.data)
        setServiceHealth(healthRes.data)
      }
      setError(null)
    } catch (err) {
      console.error('[useMetrics] Fetch failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [fetchAll])

  return { metrics, districts, serviceHealth, sparklines, loading, error, refetch: fetchAll }
}
