import { Router } from 'express'
import { getPreferences, patchPreferences } from '../controllers/preferencesController.js'

const router = Router()

router.get('/preferences', getPreferences)
router.patch('/preferences', patchPreferences)

export default router
