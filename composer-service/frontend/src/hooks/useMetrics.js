import { useState, useEffect, useCallback, useRef } from 'react'
import { metricsApi, healthApi } from '../services/api'

// ─── District name → map geo ID ──────────────────────────────────────────────
const DISTRICT_NAME_TO_ID = {
  'Viana do Castelo': 'viana',
  'Braga':            'braga',
  'Vila Real':        'vila_real',
  'Bragança':         'braganca',
  'Porto':            'porto',
  'Aveiro':           'aveiro',
  'Viseu':            'viseu',
  'Guarda':           'guarda',
  'Coimbra':          'coimbra',
  'Castelo Branco':   'castelo_branco',
  'Leiria':           'leiria',
  'Santarém':         'santarem',
  'Portalegre':       'portalegre',
  'Lisboa':           'lisboa',
  'Évora':            'evora',
  'Setúbal':          'setubal',
  'Beja':             'beja',
  'Faro':             'faro',
}

function extractMetrics(data) {
  return {
    devicesTotal:      data.devicesTotal      ?? 0,
    devicesOnline:     data.devicesOnline     ?? 0,
    devicesOffline:    data.devicesOffline    ?? 0,
    anomaliesDetected: data.anomaliesDetected ?? 0,
  }
}

function extractDistricts(data) {
  if (!Array.isArray(data)) return []
  return data.map((d) => ({
    ...d,
    id: DISTRICT_NAME_TO_ID[d.name] ?? d.id,
  }))
}

function generateSparkline(length = 20) {
  const arr = []
  let val = 50 + Math.random() * 50
  for (let i = 0; i < length; i++) {
    val += (Math.random() - 0.48) * 15
    val = Math.max(10, Math.min(100, val))
    arr.push(Math.floor(val))
  }
  return arr
}

const BASE_INTERVAL = 5000   // poll every 5s when healthy
const MAX_INTERVAL  = 30000  // back off to 30s on repeated errors

export default function useMetrics() {
  const [metrics, setMetrics]             = useState(null)
  const [districts, setDistricts]         = useState([])
  const [serviceHealth, setServiceHealth] = useState(null)
  const [sparklines, setSparklines]       = useState({
    requests: generateSparkline(),
    firewall: generateSparkline(),
    devices:  generateSparkline(),
    cache:    generateSparkline(),
  })
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const intervalRef    = useRef(null)
  const currentInterval = useRef(BASE_INTERVAL)
  const errorCount     = useRef(0)

  const scheduleNext = useCallback((success) => {
    if (intervalRef.current) clearTimeout(intervalRef.current)

    if (success) {
      errorCount.current     = 0
      currentInterval.current = BASE_INTERVAL
    } else {
      errorCount.current++
      // Exponential backoff: 5s → 10s → 20s → 30s (cap)
      currentInterval.current = Math.min(
        BASE_INTERVAL * Math.pow(2, errorCount.current),
        MAX_INTERVAL
      )
    }

    intervalRef.current = setTimeout(fetchAll, currentInterval.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    try {
      const [summaryResult, districtsResult, healthResult] = await Promise.allSettled([
        metricsApi.getSummary(),
        metricsApi.getDistricts(),
        healthApi.check(),
      ])

      let anySuccess = false

      // ── Metrics ─────────────────────────────────────────────────────────
      if (summaryResult.status === 'fulfilled') {
        const m = extractMetrics(summaryResult.value.data)
        setMetrics(m)
        setSparklines((prev) => ({
          requests: [...prev.requests.slice(1), m.devicesTotal],
          firewall: [...prev.firewall.slice(1), m.anomaliesDetected],
          devices:  [...prev.devices.slice(1),  m.devicesOnline],
          cache:    [...prev.cache.slice(1),    m.devicesOffline],
        }))
        setError(null)
        anySuccess = true
      } else {
        console.error('[useMetrics] metrics fetch failed:', summaryResult.reason?.message)
        setError(summaryResult.reason?.message ?? 'Failed to load metrics')
      }

      // ── Districts ────────────────────────────────────────────────────────
      if (districtsResult.status === 'fulfilled') {
        setDistricts(extractDistricts(districtsResult.value.data))
      }

      // ── Health ───────────────────────────────────────────────────────────
      if (healthResult.status === 'fulfilled') {
        setServiceHealth(healthResult.value.data)
      } else {
        setServiceHealth({
          compositor:   { status: 'unknown', latency: null },
          oam:          { status: 'unknown', latency: null },
          notification: { status: 'unknown', latency: null },
          anomaly:      { status: 'unknown', latency: null },
        })
      }

      scheduleNext(anySuccess)
    } catch (err) {
      console.error('[useMetrics] unexpected error:', err)
      setError(err.message)
      scheduleNext(false)
    } finally {
      setLoading(false)
    }
  }, [scheduleNext])

  useEffect(() => {
    fetchAll()
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current)
    }
  }, [fetchAll])

  return { metrics, districts, serviceHealth, sparklines, loading, error, refetch: fetchAll }
}
