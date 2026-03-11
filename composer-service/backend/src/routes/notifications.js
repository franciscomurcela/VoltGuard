import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { list, count, markRead } from '../controllers/notificationController.js'

const router = Router()

router.use(requireAuth)

// List recent notifications
router.get('/', list)

// Unread count
router.get('/count', count)

// Mark as read
router.put('/:id/read', markRead)

export default router
