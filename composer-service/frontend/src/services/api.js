import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

let tokenGetter = null
export const setTokenGetter = (fn) => { tokenGetter = fn }

api.interceptors.request.use(
  (config) => {
    if (tokenGetter) {
      const token = tokenGetter()
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response
      if (status === 401) console.warn('[API] Unauthorized — token may be expired')
      if (status === 403) console.warn('[API] Forbidden — insufficient role/permissions')
      if (status >= 500 && status !== 503) console.error('[API] Server error:', error.response.data)
    } else if (error.code === 'ECONNABORTED') {
      console.warn('[API] Request timeout')
    }
    return Promise.reject(error)
  }
)

export const devicesApi = {
  getAll:  ()         => api.get('/devices'),
  getById: (id)       => api.get(`/devices/${id}`),
  create:  (data)     => api.post('/devices', data),
  update:  (id, data) => api.patch(`/devices/${id}`, data),
  delete:  (id)       => api.delete(`/devices/${id}`),
  stats:   ()         => api.get('/devices/stats'),
}

export const sensorActionsApi = {
  reboot:         (id)             => api.post(`/devices/${id}/actions/reboot`),
  updateFirmware: (id, firmwareId) => api.post(`/devices/${id}/actions/update-firmware`, { firmware_id: firmwareId }),
  clearAnomaly:   (id)             => api.post(`/devices/${id}/actions/clear-anomaly`),
}

export const firmwaresApi = {
  getAll: () => api.get('/devices/firmwares'),
  upload: (file, version) => {
    const form = new FormData()
    form.append('file', file)
    form.append('version', version)
    return api.post('/devices/firmwares', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },
  getDownloadUrl: (id) => `/api/devices/firmwares/download/${id}`,
}

export const metricsApi = {
  getSummary:   () => api.get('/metrics',         { timeout: 30000 }),
  getDistricts: () => api.get('/districts/stats', { timeout: 30000 }),
}

export const healthApi = {
  check: () => api.get('/health', {
    timeout: 10000,
    validateStatus: (s) => s === 200 || s === 503,
  }),
}

export default api
