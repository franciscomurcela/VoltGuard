import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getDistrictStats } from '../controllers/metricsController.js'
import * as deviceService from '../services/deviceService.js'

const router = Router()

router.use(requireAuth)

/**
 * GET /api/districts/stats
 * Per-district request counts and rates — proxied from OAM.
 * This is what the PortugalMap heatmap consumes.
 */
router.get('/stats', getDistrictStats)

/**
 * GET /api/districts/devices
 * Device count distribution per district — computed from the device list.
 * Useful for the map overlay showing device density.
 */
router.get('/devices', async (req, res, next) => {
  try {
    const stats = await deviceService.getDeviceStats(req)
    res.json({
      byDistrict: stats.byDistrict,
      total: stats.total,
      active: stats.active,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/districts/:districtId/summary
 * Aggregated info for a single district — devices + metrics.
 */
router.get('/:districtId/summary', async (req, res, next) => {
  try {
    const { districtId } = req.params
    const devices = await deviceService.listDevices(req)

    // Filter devices for this district (match by ID or name)
    const districtDevices = devices.filter((d) => {
      const dName = d.district?.toLowerCase().replace(/\s+/g, '_') || ''
      return dName === districtId.toLowerCase() || d.district === districtId
    })

    res.json({
      district: districtId,
      deviceCount: districtDevices.length,
      activeDevices: districtDevices.filter((d) => d.status === 'active').length,
      devices: districtDevices,
      byType: districtDevices.reduce((acc, d) => {
        acc[d.type] = (acc[d.type] || 0) + 1
        return acc
      }, {}),
    })
  } catch (err) {
    next(err)
  }
})

export default router
