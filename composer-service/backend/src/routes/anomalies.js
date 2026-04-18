import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listAnomalies,
  getAnomaly,
  getSummary,
  getModelConfig,
  updateModelConfig,
  simulateAnomalyNotification,
  exportAnomalies,
} from '../controllers/anomalyController.js'
import { listModels, getForecast } from '../controllers/measurementController.js'

const router = Router()

router.use(requireAuth)

// Summary stats (used by dashboard)
router.get('/summary', getSummary)

// Model config — read for any user, write for admin
router.get('/model-config', getModelConfig)
router.put('/model-config', requireRole('admin'), updateModelConfig)

// AI model list
router.get('/models', listModels)

// Forecasts per sensor
router.get('/forecasts/:sensorId', getForecast)

// Manual simulation of anomaly -> notifications flow
router.post('/simulate-notification', requireRole('admin'), simulateAnomalyNotification)

// Anomaly history export — must be before /:id to avoid routing conflict
// Query: ?district=Porto&severity=CRITICAL&from=2024-01-01&to=2024-12-31&format=csv|json
router.get('/export', exportAnomalies)

// Anomaly list and detail
router.get('/', listAnomalies)
router.get('/:id', getAnomaly)

export default router
