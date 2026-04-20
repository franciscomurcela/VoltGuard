import { useState, useCallback } from 'react'
import { anomaliesApi } from '../services/api'

export default function useForecasts() {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchForecast = useCallback(async (sensorId, params = {}) => {
    if (!sensorId) return
    setLoading(true)
    setError(null)
    try {
      const res = await anomaliesApi.getForecast(sensorId, params)
      setForecast(res.data)
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (err?.response?.status === 404 ? 'No forecast available — sensor may not have enough measurements.' : null) ||
        err.message ||
        'Failed to load forecast'
      setError(msg)
      setForecast(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return { forecast, loading, error, fetchForecast, clearForecast: () => { setForecast(null); setError(null) } }
}
