import * as preferencesProxy from '../services/preferencesProxy.js'

export async function getPreferences(req, res, next) {
  try {
    const { secret } = req.query
    if (!secret) {
      return res.status(400).json({
        error: {
          message: 'secret is required',
          type: 'validation_error',
          code: 400,
        },
      })
    }

    const data = await preferencesProxy.getPreferences(secret)
    return res.json(data)
  } catch (err) {
    return next(err)
  }
}

export async function patchPreferences(req, res, next) {
  try {
    const { secret } = req.query
    if (!secret) {
      return res.status(400).json({
        error: {
          message: 'secret is required',
          type: 'validation_error',
          code: 400,
        },
      })
    }

    const data = await preferencesProxy.patchPreferences(secret, req.body || {})
    return res.json(data)
  } catch (err) {
    return next(err)
  }
}
