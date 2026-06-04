import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getOverview, getAnomalyStats } from '../controllers/dashboardController.js'

const router = Router()

router.use(requireAuth)

// Operational overview: fleet availability, active incidents, pending actions
router.get('/overview', getOverview)

// Anomaly analytics: frequency by district, recurrence rate, critical event rate
// Query: ?window=7|30
router.get('/anomaly-stats', getAnomalyStats)

export default router
