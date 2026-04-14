import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { list, getById, send, triggerDigest } from '../controllers/notificationController.js'

const router = Router()

router.use(requireAuth)

router.get('/', list)
router.get('/:id', getById)
router.post('/', send)

// Manual digest flush — admin only
router.post('/digest/process', requireRole('admin'), triggerDigest)

export default router
