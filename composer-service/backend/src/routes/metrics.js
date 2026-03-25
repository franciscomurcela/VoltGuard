import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSummary, getDistrictStats } from '../controllers/metricsController.js'

const router = Router()

router.use(requireAuth)

// Aggregated metrics from OAM + Anomaly
router.get('/', getSummary)

// Per-district stats (proxied from OAM)
router.get('/districts', getDistrictStats)

export default router
