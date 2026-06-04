import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listAnomalies,
  getAnomaly,
  getSummary,
  getBySensorSummary,
  getModelConfig,
  updateModelConfig,
  getLatestForecast,
  triggerSensorAnalysis,
  simulateAnomalyNotification,
  exportAnomalies,
  getSensorProcessingState,
  clearAnomalies,
} from '../controllers/anomalyController.js'
import { listModels, getForecast } from '../controllers/measurementController.js'

const router = Router()

router.use(requireAuth)

// Summary stats (used by dashboard)
router.get('/summary', getSummary)
router.get('/by-sensor', getBySensorSummary)

// Model config — read for any user, write for admin
router.get('/model-config', getModelConfig)
router.put('/model-config', requireRole('admin'), updateModelConfig)

// AI model list
router.get('/models', listModels)

// Forecasts per sensor
router.get('/forecasts/latest/:sensorId', getLatestForecast)
router.get('/forecasts/:sensorId', getForecast)

// Trigger sensor analysis (reprocess latest measurement for sensor)
router.post('/analysis/:sensorId', triggerSensorAnalysis)

// Last measurement_processed state per sensor (fed by webhook)
router.get('/processing-state/:sensorId', getSensorProcessingState)

// Manual simulation of anomaly -> notifications flow
router.post('/simulate-notification', requireRole('admin'), simulateAnomalyNotification)

// Anomaly history export — must be before /:id to avoid routing conflict
// Query: ?district=Porto&severity=CRITICAL&from=2024-01-01&to=2024-12-31&format=csv|json
router.get('/export', exportAnomalies)

// Anomaly list and detail
router.get('/', listAnomalies)
router.get('/:id', getAnomaly)

// Demo/reset — wipe every anomaly. Any authenticated user; the UI requires a
// typed-DELETE confirmation. For production, tighten to requireRole('admin').
router.delete('/', clearAnomalies)

export default router
