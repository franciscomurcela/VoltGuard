import axios from 'axios'

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Token Interceptor ──────────────────────────────────────────────────────
let tokenGetter = null

export const setTokenGetter = (fn) => {
  tokenGetter = fn
}

api.interceptors.request.use(
  (config) => {
    if (tokenGetter) {
      const token = tokenGetter()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─── Response Error Handling ────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response

      if (status === 401) {
        console.warn('[API] Unauthorized — token may be expired')
        // Keycloak will handle re-auth via its own refresh cycle
      }

      if (status === 403) {
        console.warn('[API] Forbidden — insufficient role/permissions')
      }

      if (status >= 500) {
        console.error('[API] Server error:', error.response.data)
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error('[API] Request timeout')
    }

    return Promise.reject(error)
  }
)

// ─── Typed Endpoints ────────────────────────────────────────────────────────
export const devicesApi = {
  getAll: () => api.get('/devices'),
  getById: (id) => api.get(`/devices/${id}`),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
}

export const metricsApi = {
  getSummary: () => api.get('/metrics', { timeout: 30000 }),
  getDistricts: () => api.get('/districts/stats', { timeout: 30000 }),
}

export const healthApi = {
  check: () => api.get('/health', { timeout: 30000 }),
}

export const anomaliesApi = {
  getAll: (params) => api.get('/anomalies', { params }),
  getById: (id) => api.get(`/anomalies/${id}`),
  getBySensor: (sourceId, params = {}) => api.get('/anomalies', { params: { source_id: sourceId, limit: 1000, ...params } }),
  getBySensorSummary: (sourceId, params = {}) => api.get('/anomalies/by-sensor', { params: { source_id: sourceId, ...params } }),
  getSummary: () => api.get('/anomalies/summary'),
  getModelConfig: () => api.get('/anomalies/model-config'),
  updateModelConfig: (data) => api.put('/anomalies/model-config', data),
  getForecast: (sensorId, params = {}) => api.get(`/anomalies/forecasts/${sensorId}`, { params, timeout: 120000 }),
  getLatestForecast: (sensorId, params = {}) => api.get(`/anomalies/forecasts/latest/${sensorId}`, { params }),
  triggerAnalysis: (sensorId, data = {}) => api.post(`/anomalies/analysis/${sensorId}`, data, { timeout: 120000 }),
  getProcessingState: (sensorId) => api.get(`/anomalies/processing-state/${sensorId}`),
}

export const measurementsApi = {
  getBySensor: (sourceId) => api.get('/measurements', { params: { source_id: sourceId } }),
  ingestJson: (data) => api.post('/measurements', data, { timeout: 120000 }),
  ingestCsv: (formData) => api.post('/measurements/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  importFromUrl: (data) => api.post('/measurements/import', data, { timeout: 120000 }),
}

export const notificationsApi = {
  getAll: (params) => api.get('/notifications', { params }),
  getById: (id) => api.get(`/notifications/${id}`),
  send: (data, options = {}) => {
    const idempotencyKey = options.idempotencyKey || generateIdempotencyKey()
    return api.post('/notifications', data, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  },
}

export const preferencesApi = {
  getBySecret: (secret) => api.get('/public/preferences', { params: { secret } }),
  patchBySecret: (secret, data) => api.patch('/public/preferences', data, { params: { secret } }),
}

export const sensorActionsApi = {
  reboot: (deviceId) => api.post(`/devices/${deviceId}/actions`, { action: 'REBOOT' }),
  clearAnomaly: (deviceId) => api.post(`/devices/${deviceId}/actions`, { action: 'CLEAR_ANOMALY' }),
  updateFirmware: (deviceId, firmwareId) => api.post(`/devices/${deviceId}/actions`, { action: 'FIRMWARE_UPDATE', firmware_id: firmwareId }),
  reportAnomaly: (deviceId, data) => api.post(`/devices/${deviceId}/anomalies`, data),
  sendKeepalive: (deviceId, data) => api.post(`/devices/${deviceId}/keepalive`, data),
}

export const firmwaresApi = {
  getAll: () => api.get('/firmwares'),
  upload: (file, version) => {
    const form = new FormData()
    form.append('file', file)
    form.append('version', version)
    return api.post('/firmwares', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getDownloadUrl: (id) => `/api/firmwares/${id}/download`,
}

export default api
