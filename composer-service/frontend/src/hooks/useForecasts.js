import { useState, useCallback } from 'react'
import { anomaliesApi } from '../services/api'

export default function useForecasts() {
  const [forecast, setForecast] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchLatestForecast = useCallback(async (sensorId, params = {}) => {
    if (!sensorId) return
    setLoading(true)
    setError(null)
    try {
      const res = await anomaliesApi.getLatestForecast(sensorId, params)
      setForecast(res.data)
      setSource('latest')
    } catch (err) {
      if (err?.response?.status === 404) {
        try {
          const fallbackRes = await anomaliesApi.getForecast(sensorId, {
            periods: 24,
            metric_name: params?.metric_name || 'voltage',
          })
          setForecast(fallbackRes.data)
          setSource('generated')
          return
        } catch {
          // If fallback also fails, keep existing error handling below.
        }
      }

      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (err?.response?.status === 404 ? 'No persisted forecast available yet for this sensor/metric.' : null) ||
        err.message ||
        'Failed to load forecast'
      setError(msg)
      setForecast(null)
      setSource(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchForecastDetail = useCallback(async (sensorId, params = {}) => {
    if (!sensorId) return
    setLoading(true)
    setError(null)
    try {
      const res = await anomaliesApi.getForecast(sensorId, params)
      setForecast(res.data)
      setSource('generated')
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        (err?.response?.status === 404 ? 'No forecast available — sensor may not have enough measurements.' : null) ||
        err.message ||
        'Failed to load forecast detail'
      setError(msg)
      setForecast(null)
      setSource(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    forecast,
    source,
    loading,
    error,
    fetchLatestForecast,
    fetchForecastDetail,
    clearForecast: () => {
      setForecast(null)
      setError(null)
      setSource(null)
    },
  }
}
