import { Router } from 'express'
import { check, liveness, readiness } from '../controllers/healthController.js'

const router = Router()

// Full health (compositor + all peers) — used by frontend dashboard
router.get('/', check)

// K8s liveness probe — just checks the process is alive
router.get('/live', liveness)

// K8s readiness probe — checks at least one peer is reachable
router.get('/ready', readiness)

export default router
