import { Router } from 'express'
import { check, liveness, readiness } from '../controllers/healthController.js'

const router = Router()

// Full health (compositor + all peers) — used by frontend dashboard
router.get('/', check)

// Liveness probe — just checks the process is alive
router.get('/live', liveness)

// Readiness probe — checks at least one peer is reachable
router.get('/ready', readiness)

export default router
