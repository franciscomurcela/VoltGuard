import { useState, useCallback, useEffect } from 'react'
import { anomaliesApi, measurementsApi } from '../services/api'

export default function useSensorAnomalyStats(sensorId) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!sensorId) return
    setLoading(true)
    setError(null)
    try {
      const [anomaliesRes, measurementsRes, processingRes] = await Promise.allSettled([
        anomaliesApi.getBySensor(sensorId),
        measurementsApi.getBySensor(sensorId),
        anomaliesApi.getProcessingState(sensorId),
      ])

      const anomalyData = anomaliesRes.status === 'fulfilled' ? anomaliesRes.value.data : null
      const totalAnomalies = anomalyData?.total ?? anomalyData?.items?.length ?? 0

      const measurementData = measurementsRes.status === 'fulfilled' ? measurementsRes.value.data : null
      const measurementItems = measurementData?.items ?? (Array.isArray(measurementData) ? measurementData : [])
      const totalMeasurements = measurementData?.total ?? measurementItems.length

      const lastProcessing = processingRes.status === 'fulfilled' ? processingRes.value.data : null

      setStats({
        totalAnomalies,
        totalMeasurements,
        ratio: totalMeasurements > 0 ? (totalAnomalies / totalMeasurements).toFixed(3) : '—',
        lastProcessing,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sensorId])

  useEffect(() => { fetch() }, [fetch])

  return { stats, loading, error, refetch: fetch }
}
