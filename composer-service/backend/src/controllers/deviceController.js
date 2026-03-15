import * as oam from '../services/oamProxy.js'
import logger from '../utils/logger.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(res, err, context) {
  const status = err.response?.status ?? 500
  const message = err.response?.data?.message ?? err.message ?? 'Unexpected error'
  logger.error({ context, status, message }, 'OAM proxy error')
  res.status(status).json({ error: message })
}

// ─── Sensors ──────────────────────────────────────────────────────────────────

export async function listDevices(req, res) {
  try {
    const data = await oam.getAllDevices(req)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'listDevices')
  }
}

export async function getDevice(req, res) {
  try {
    const data = await oam.getDeviceById(req, req.params.id)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'getDevice')
  }
}

export async function registerDevice(req, res) {
  try {
    const data = await oam.createDevice(req, req.body)
    res.status(201).json(data)
  } catch (err) {
    handleError(res, err, 'registerDevice')
  }
}

export async function modifyDevice(req, res) {
  try {
    const data = await oam.updateDevice(req, req.params.id, req.body)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'modifyDevice')
  }
}

export async function removeDevice(req, res) {
  try {
    await oam.deleteDevice(req, req.params.id)
    res.status(204).end()
  } catch (err) {
    handleError(res, err, 'removeDevice')
  }
}

export async function deviceStats(req, res) {
  try {
    const data = await oam.getMetrics(req)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'deviceStats')
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function actionReboot(req, res) {
  try {
    const data = await oam.scheduleReboot(req, req.params.id)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'actionReboot')
  }
}

export async function actionUpdateFirmware(req, res) {
  try {
    const { firmware_id } = req.body
    if (!firmware_id) {
      return res.status(400).json({ error: 'firmware_id is required' })
    }
    const data = await oam.scheduleFirmwareUpdate(req, req.params.id, firmware_id)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'actionUpdateFirmware')
  }
}

export async function actionClearAnomaly(req, res) {
  try {
    const data = await oam.clearAnomaly(req, req.params.id)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'actionClearAnomaly')
  }
}

// ─── Firmware ─────────────────────────────────────────────────────────────────

export async function listFirmwares(req, res) {
  try {
    const data = await oam.getAllFirmwares(req)
    res.json(data)
  } catch (err) {
    handleError(res, err, 'listFirmwares')
  }
}

export async function uploadFirmware(req, res) {
  try {
    // Pass the raw request so oamProxy can stream the multipart body to OAM
    const data = await oam.uploadFirmware(req)
    res.status(201).json(data ?? { ok: true })
  } catch (err) {
    handleError(res, err, 'uploadFirmware')
  }
}

export async function downloadFirmware(req, res) {
  try {
    const oamRes = await oam.downloadFirmware(req, req.params.id)
    // Forward content headers from OAM then pipe the binary stream
    res.setHeader('Content-Type', oamRes.headers['content-type'] ?? 'application/octet-stream')
    const disposition = oamRes.headers['content-disposition']
    if (disposition) res.setHeader('Content-Disposition', disposition)
    oamRes.data.pipe(res)
  } catch (err) {
    handleError(res, err, 'downloadFirmware')
  }
}
