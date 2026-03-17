import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listFirmwares, uploadFirmware, downloadFirmware } from '../controllers/firmwareController.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB max

router.use(requireAuth)

// List all firmware versions
router.get('/', listFirmwares)

// Upload new firmware (admin only)
router.post('/', requireRole('admin'), upload.single('file'), uploadFirmware)

// Download a firmware binary
router.get('/:id/download', downloadFirmware)

export default router
