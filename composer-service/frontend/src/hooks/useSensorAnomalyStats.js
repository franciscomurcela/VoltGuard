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
      const [aggregateRes, processingRes, measurementsRes] = await Promise.allSettled([
        anomaliesApi.getBySensorSummary(sensorId),
        anomaliesApi.getProcessingState(sensorId),
        measurementsApi.getBySensor(sensorId),
      ])

      const aggregateData = aggregateRes.status === 'fulfilled' ? aggregateRes.value.data : null
      const aggregate = aggregateData?.items?.find((item) => item.source_id === sensorId) || null

      const totalAnomalies = aggregate?.anomalies_total ?? 0
      const totalMeasurements = aggregate?.measurements_total ?? 0

      const measurementData = measurementsRes.status === 'fulfilled' ? measurementsRes.value.data : null
      const measurementItems = measurementData?.measurements ?? measurementData?.items ?? (Array.isArray(measurementData) ? measurementData : [])
      const totalSamples = measurementItems.reduce((acc, item) => acc + Number(item?.rows || 0), 0)
      const totalValidationSamples = measurementItems.reduce((acc, item) => acc + Number(item?.rows_forecast || 0), 0)

      const lastProcessing = processingRes.status === 'fulfilled' ? processingRes.value.data : null

      setStats({
        totalDatasets: totalMeasurements,
        totalAnomalies,
        totalMeasurements,
        totalSamples,
        totalValidationSamples,
        ratio: totalMeasurements > 0
          ? String(aggregate?.measurement_anomaly_rate ?? (totalAnomalies / totalMeasurements).toFixed(3))
          : '—',
        sampleRatio: totalSamples > 0 ? (totalAnomalies / totalSamples).toFixed(3) : '—',
        validationSampleRatio: totalValidationSamples > 0 ? (totalAnomalies / totalValidationSamples).toFixed(3) : '—',
        anomaliesPerMeasurement: aggregate?.anomalies_per_measurement ?? null,
        measurementsWithAnomaly: aggregate?.measurements_with_anomaly ?? 0,
        latestSeverity: aggregate?.latest_severity ?? null,
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
