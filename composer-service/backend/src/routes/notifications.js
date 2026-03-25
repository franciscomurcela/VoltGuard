import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { list, getById, send } from '../controllers/notificationController.js'

const router = Router()

router.use(requireAuth)

router.get('/', list)
router.get('/:id', getById)
router.post('/', send)

export default router
