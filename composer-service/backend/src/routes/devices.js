import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listDevices,
  getDevice,
  registerDevice,
  modifyDevice,
  removeDevice,
  deviceStats,
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

export default router
