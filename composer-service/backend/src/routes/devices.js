import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listDevices,
  getDevice,
  registerDevice,
  modifyDevice,
  removeDevice,
  deviceStats,
  // Actions
  actionReboot,
  actionUpdateFirmware,
  actionClearAnomaly,
  // Firmware
  listFirmwares,
  uploadFirmware,
  downloadFirmware,
} from '../controllers/deviceController.js'

const router = Router()

// All device routes require authentication
router.use(requireAuth)

// ─── Sensors ─────────────────────────────────────────────────────────────────
// Read — any authenticated user
router.get('/',       listDevices)
router.get('/stats',  deviceStats)
router.get('/:id',    getDevice)

// Write — admin only
router.post('/',      requireRole('admin'), registerDevice)
router.patch('/:id',  requireRole('admin'), modifyDevice)
router.delete('/:id', requireRole('admin'), removeDevice)

// ─── Sensor Actions — admin only ─────────────────────────────────────────────
router.post('/:id/actions/reboot',           requireRole('admin'), actionReboot)
router.post('/:id/actions/update-firmware',  requireRole('admin'), actionUpdateFirmware)
router.post('/:id/actions/clear-anomaly',    requireRole('admin'), actionClearAnomaly)

// ─── Firmware ────────────────────────────────────────────────────────────────
// List + download — any authenticated user
router.get('/firmwares',              listFirmwares)
router.get('/firmwares/download/:id', downloadFirmware)

// Upload — admin only
router.post('/firmwares',             requireRole('admin'), uploadFirmware)

export default router
