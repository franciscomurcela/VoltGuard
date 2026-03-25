import { useState, useEffect, useCallback } from 'react'
import { firmwaresApi } from '../services/api'

export default function useFirmwares() {
  const [firmwares, setFirmwares] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetchFirmwares = useCallback(async () => {
    try {
      const res = await firmwaresApi.getAll()
      // Sort newest first
      const sorted = [...(res.data ?? [])].sort(
        (a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)
      )
      setFirmwares(sorted)
      setError(null)
    } catch (err) {
      console.error('[useFirmwares] fetch failed:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFirmwares() }, [fetchFirmwares])

  const uploadFirmware = useCallback(async (file, version) => {
    const res = await firmwaresApi.upload(file, version)
    await fetchFirmwares()
    return res.data
  }, [fetchFirmwares])

  return { firmwares, loading, error, uploadFirmware, refetch: fetchFirmwares }
}
