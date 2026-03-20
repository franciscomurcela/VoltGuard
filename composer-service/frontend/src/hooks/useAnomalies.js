import { useState, useEffect, useCallback, useRef } from 'react'
import { anomaliesApi } from '../services/api'

const POLL_INTERVAL = 5000
const USE_MOCK = false

// ─── Mock Data ──────────────────────────────────────────────────────────────
function generateMockSummary() {
  return {
    total_anomalies: 4 + Math.floor(Math.random() * 3),
    total_jobs: 12,
    jobs_completed: 10,
    jobs_pending: 1,
    jobs_processing: 1,
    jobs_failed: 0,
    active_webhooks: 0,
    model_config: { prophet_uncertainty_interval: 0.95, pyod_contamination_rate: 0.05 },
  }
}

const MOCK_ANOMALIES = {
  items: [
    { anomaly_id: 'anom_001', source_id: 'node_01', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), severity: 'medium' },
    { anomaly_id: 'anom_002', source_id: 'node_03', timestamp: new Date(Date.now() - 5 * 3600000).toISOString(), severity: 'high' },
    { anomaly_id: 'anom_003', source_id: 'node_01', timestamp: new Date(Date.now() - 8 * 3600000).toISOString(), severity: 'medium' },
    { anomaly_id: 'anom_004', source_id: 'node_05', timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), severity: 'low' },
  ],
  total: 4,
  limit: 25,
  offset: 0,
  has_more: false,
}

const MOCK_MODEL_CONFIG = {
  prophet_uncertainty_interval: 0.95,
  pyod_contamination_rate: 0.05,
}
// ─── End Mock ───────────────────────────────────────────────────────────────

export default function useAnomalies() {
  const [anomalies, setAnomalies] = useState({ items: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [modelConfig, setModelConfig] = useState(null)
  const [selectedAnomaly, setSelectedAnomaly] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchAnomalies = useCallback(async (params = {}) => {
    try {
      if (USE_MOCK) {
        setAnomalies(MOCK_ANOMALIES)
      } else {
        const res = await anomaliesApi.getAll(params)
        setAnomalies(res.data)
      }
      setError(null)
    } catch (err) {
      console.error('[useAnomalies] List failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      if (USE_MOCK) {
        setSummary(generateMockSummary())
      } else {
        const res = await anomaliesApi.getSummary()
        setSummary(res.data)
      }
    } catch (err) {
      console.error('[useAnomalies] Summary failed:', err)
    }
  }, [])

  const fetchModelConfig = useCallback(async () => {
    try {
      if (USE_MOCK) {
        setModelConfig(MOCK_MODEL_CONFIG)
      } else {
        const res = await anomaliesApi.getModelConfig()
        setModelConfig(res.data)
      }
    } catch (err) {
      console.error('[useAnomalies] Model config failed:', err)
    }
  }, [])

  const fetchAnomalyDetail = useCallback(async (id) => {
    try {
      if (USE_MOCK) {
        setSelectedAnomaly({
          anomaly_id: id,
          source_id: 'node_01',
          timestamp: new Date().toISOString(),
          trigger_metrics: { voltage: 245.5, current: 85.2, power_factor: 0.92 },
          detection_method: 'Prophet',
          confidence_score: 0.87,
        })
      } else {
        const res = await anomaliesApi.getById(id)
        setSelectedAnomaly(res.data)
      }
    } catch (err) {
      console.error('[useAnomalies] Detail failed:', err)
      setError(err.message)
    }
  }, [])

  const updateModelConfig = useCallback(async (config) => {
    try {
      if (USE_MOCK) {
        setModelConfig(config)
        return config
      } else {
        const res = await anomaliesApi.updateModelConfig(config)
        setModelConfig(res.data)
        return res.data
      }
    } catch (err) {
      console.error('[useAnomalies] Config update failed:', err)
      setError(err.message)
      throw err
    }
  }, [])

  useEffect(() => {
    fetchAnomalies()
    fetchSummary()
    fetchModelConfig()
    intervalRef.current = setInterval(fetchSummary, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [fetchAnomalies, fetchSummary, fetchModelConfig])

  return {
    anomalies,
    summary,
    modelConfig,
    selectedAnomaly,
    loading,
    error,
    fetchAnomalies,
    fetchAnomalyDetail,
    updateModelConfig,
    clearSelected: () => setSelectedAnomaly(null),
  }
}
