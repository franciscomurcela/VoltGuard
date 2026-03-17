import * as oam from '../services/oamProxy.js'
import logger from '../utils/logger.js'

/**
 * GET /api/firmwares
 */
export async function listFirmwares(req, res, next) {
  try {
    const data = await oam.getAllFirmwares(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/firmwares  (multipart — file + version)
 * Proxies the upload to OAM's firmware endpoint.
 */
export async function uploadFirmware(req, res, next) {
  try {
    // req is piped through as multipart — we need to forward the raw body
    // Using a stream-based approach with the proxy client
    const { default: client, forwardHeaders } = await import('../utils/proxyClient.js')
    const { getServiceUrl } = await import('../utils/serviceDiscovery.js')
    const FormData = (await import('form-data')).default

    const form = new FormData()

    if (req.file) {
      // If multer processed it
      form.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      })
    }

    if (req.body.version) {
      form.append('version', req.body.version)
    }

    const headers = forwardHeaders(req)
    const url = getServiceUrl('oam', '/firmwares')

    const response = await client.post(url, form, {
      headers: { ...headers, ...form.getHeaders() },
      maxBodyLength: Infinity,
    })

    logger.info({ version: req.body.version }, 'Firmware uploaded via compositor')
    res.status(201).json(response.data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/firmwares/:id/download
 * Proxies the download stream from OAM.
 */
export async function downloadFirmware(req, res, next) {
  try {
    const { default: client, forwardHeaders } = await import('../utils/proxyClient.js')
    const { getServiceUrl } = await import('../utils/serviceDiscovery.js')

    const url = getServiceUrl('oam', `/firmwares/${req.params.id}/download`)
    const response = await client.get(url, {
      headers: forwardHeaders(req),
      responseType: 'stream',
    })

    // Forward headers from OAM
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type'])
    }
    if (response.headers['content-disposition']) {
      res.setHeader('Content-Disposition', response.headers['content-disposition'])
    }

    response.data.pipe(res)
  } catch (err) {
    next(err)
  }
}
