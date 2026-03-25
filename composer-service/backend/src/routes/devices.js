import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listDevices,
  getDevice,
  registerDevice,
  modifyDevice,
  removeDevice,
  deviceStats,
  dispatchAction,
  reportAnomaly,
  sendKeepalive,
} from '../controllers/deviceController.js'

const router = Router()

// All device routes require authentication
router.use(requireAuth)

// Read — any authenticated user
router.get('/', listDevices)
router.get('/stats', deviceStats)
router.get('/:id', getDevice)

// Write — admin role only
router.post('/', requireRole('admin'), registerDevice)
router.put('/:id', requireRole('admin'), modifyDevice)
router.delete('/:id', requireRole('admin'), removeDevice)

// Actions — admin role only
router.post('/:id/actions', requireRole('admin'), dispatchAction)

// Anomaly reporting (from anomaly detection service or manual)
router.post('/:id/anomalies', requireRole('admin'), reportAnomaly)

// Keepalive (heartbeat — could be called by sensors or simulator)
router.post('/:id/keepalive', sendKeepalive)

export default router
