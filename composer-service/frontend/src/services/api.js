import axios from 'axios'

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
  getSummary: () => api.get('/metrics'),
  getDistricts: () => api.get('/districts/stats'),
}

export const healthApi = {
  check: () => api.get('/health'),
}

export const anomaliesApi = {
  getAll: (params) => api.get('/anomalies', { params }),
  getById: (id) => api.get(`/anomalies/${id}`),
  getSummary: () => api.get('/anomalies/summary'),
  getModelConfig: () => api.get('/anomalies/model-config'),
  updateModelConfig: (data) => api.put('/anomalies/model-config', data),
}

export const notificationsApi = {
  getAll: (params) => api.get('/notifications', { params }),
  getById: (id) => api.get(`/notifications/${id}`),
  send: (data) => api.post('/notifications', data),
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
