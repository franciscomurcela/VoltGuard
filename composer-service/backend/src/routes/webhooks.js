import { Router } from 'express'
import { handleAnomalyWebhook } from '../controllers/webhookController.js'

const router = Router()

// No authentication — these endpoints are called by internal services,
// not by end users. The anomaly service has no Bearer token to send.
router.post('/anomaly', handleAnomalyWebhook)

export default router
