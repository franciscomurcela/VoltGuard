import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { list, getById, send, triggerDigest, clearNotifications } from '../controllers/notificationController.js'

const router = Router()

router.use(requireAuth)

router.get('/', list)
router.get('/:id', getById)
router.post('/', send)

// Demo/reset — wipe every notification + digest queue + audit. Any authenticated
// user; the UI requires a typed-DELETE confirmation. For production, tighten to
// requireRole('admin').
router.delete('/', clearNotifications)

// Manual digest flush — admin only
router.post('/digest/process', requireRole('admin'), triggerDigest)

export default router
