import { useState, useEffect, useCallback } from 'react'
import { notificationsApi } from '../services/api'

const USE_MOCK = false

const MOCK_NOTIFICATIONS = [
  { id: 'notif_001', client_id: 'energy_composer', status: 'DELIVERED', created_at: new Date(Date.now() - 2 * 60000).toISOString(), channel: 'twilio_sms', target: '+351912345678' },
  { id: 'notif_002', client_id: 'energy_composer', status: 'DELIVERED', created_at: new Date(Date.now() - 8 * 60000).toISOString(), channel: 'email', target: 'admin@voltguard.pt' },
  { id: 'notif_003', client_id: 'energy_composer', status: 'failed', created_at: new Date(Date.now() - 15 * 60000).toISOString(), channel: 'twilio_sms', target: '+351987654321' },
  { id: 'notif_004', client_id: 'energy_composer', status: 'DELIVERED', created_at: new Date(Date.now() - 32 * 60000).toISOString(), channel: 'twilio_whatsapp', target: '+351912345678' },
  { id: 'notif_005', client_id: 'oam_service', status: 'DELIVERED', created_at: new Date(Date.now() - 60 * 60000).toISOString(), channel: 'email', target: 'ops@voltguard.pt' },
]

export default function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [lastSent, setLastSent] = useState(null)

  const fetchNotifications = useCallback(async (params = {}) => {
    try {
      if (USE_MOCK) {
        setNotifications(MOCK_NOTIFICATIONS)
      } else {
        const res = await notificationsApi.getAll({
          limit: params.limit || 50,
          offset: params.offset || 0,
        })
        setNotifications(Array.isArray(res.data) ? res.data : [])
      }
      setError(null)
    } catch (err) {
      console.error('[useNotifications] Fetch failed:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // POST /v1/notifications
  // payload: { target, channel, alert_type, message_template }
  // client_id is injected by the proxy automatically
  const sendNotification = useCallback(async (payload) => {
    setSending(true)
    setSendError(null)
    try {
      const res = await notificationsApi.send(payload)
      setLastSent(res.data || res)
      await fetchNotifications()
      return res
    } catch (err) {
      console.error('[useNotifications] Send failed:', err)
      const message = err?.response?.data?.error?.message || err.message || 'Failed to send notification'
      setSendError(message)
      throw err
    } finally {
      setSending(false)
    }
  }, [fetchNotifications])

  const stats = notifications.reduce(
    (acc, n) => {
      acc.total++
      if (n.status === 'DELIVERED') acc.delivered++
      else if (n.status === 'failed') acc.failed++
      else acc.pending++
      return acc
    },
    { total: 0, delivered: 0, failed: 0, pending: 0 }
  )

  return {
    notifications,
    stats,
    loading,
    error,
    refetch: fetchNotifications,
    sendNotification,
    sending,
    sendError,
    lastSent,
    clearSendError: () => setSendError(null),
    clearLastSent: () => setLastSent(null),
  }
}
