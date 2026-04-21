import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listMeasurements,
  getIngestionStatus,
  getMeasurement,
  getMeasurementFull,
  uploadMeasurementsJson,
  uploadMeasurementsCsv,
  importMeasurements,
  updateIngestionConfig,
} from '../controllers/measurementController.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }) // 10 MB

router.use(requireAuth)

// Ingestion status and config (admin only for writes)
router.get('/status', getIngestionStatus)
router.put('/config', requireRole('admin'), updateIngestionConfig)

// Upload and import (admin only)
router.post('/csv',    requireRole('admin'), upload.single('file'), uploadMeasurementsCsv)
router.post('/import', requireRole('admin'), importMeasurements)
router.post('/',       requireRole('admin'), uploadMeasurementsJson)

// List and detail (any authenticated user)
router.get('/',    listMeasurements)
router.get('/:id/full', getMeasurementFull)
router.get('/:id', getMeasurement)

export default router
