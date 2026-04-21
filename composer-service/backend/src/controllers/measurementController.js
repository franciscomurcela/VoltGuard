import FormData from 'form-data'
import * as anomalyProxy from '../services/anomalyProxy.js'
import logger from '../utils/logger.js'

function normalizeMeasurementPayload(body = {}) {
  const source_id = body.source_id ?? body.sensor_id
  const metric_name = body.metric_name ?? body.metric ?? 'voltage'
  const rawDataset = body.dataset ?? body.data

  const dataset = Array.isArray(rawDataset)
    ? rawDataset.map((point) => ({
        timestamp: point?.timestamp ?? point?.ts ?? point?.datetime ?? point?.date,
        value: Number(point?.value ?? point?.y ?? point?.metric_value),
      }))
    : rawDataset

  return {
    ...body,
    source_id,
    metric_name,
    dataset,
  }
}

/**
 * GET /api/measurements
 * Query: ?source_id=<sensor_id>
 */
export async function listMeasurements(req, res, next) {
  try {
    const data = await anomalyProxy.listMeasurements(req, req.query.source_id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/measurements/status
 */
export async function getIngestionStatus(req, res, next) {
  try {
    const data = await anomalyProxy.getIngestionStatus(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/measurements/:id
 */
export async function getMeasurement(req, res, next) {
  try {
    const data = await anomalyProxy.getMeasurementById(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/measurements/:id/full
 */
export async function getMeasurementFull(req, res, next) {
  try {
    const data = await anomalyProxy.getMeasurementFullById(req, req.params.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/measurements
 * Body: DatasetUploadRequest JSON
 */
export async function uploadMeasurementsJson(req, res, next) {
  try {
    const payload = normalizeMeasurementPayload(req.body)

    if (!payload.source_id || !payload.metric_name || !Array.isArray(payload.dataset)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Body must include source_id, metric_name and dataset[] (or legacy sensor_id + data[])',
      })
    }

    if (payload.dataset.length < 6) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'dataset must contain at least 6 points',
      })
    }

    const hasInvalidPoint = payload.dataset.some((point) => {
      const hasTimestamp = typeof point.timestamp === 'string' && point.timestamp.trim().length > 0
      const hasNumericValue = Number.isFinite(point.value)
      return !hasTimestamp || !hasNumericValue
    })

    if (hasInvalidPoint) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Each dataset item must include timestamp (string) and value (number)',
      })
    }

    const data = await anomalyProxy.submitMeasurements(req, payload)
    res.status(202).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/measurements/csv
 * Multipart: file (.csv) + form fields (source_id, metric_name, ...)
 */
export async function uploadMeasurementsCsv(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file', message: 'A .csv file is required' })
    }

    const form = new FormData()
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || 'text/csv',
    })

    // Forward all expected form fields
    const fields = ['source_id', 'metric_name', 'train_ratio', 'temporal_mode', 'aggregation', 'timezone']
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        form.append(field, String(req.body[field]))
      }
    }

    const data = await anomalyProxy.submitMeasurementsCsv(req, form)
    res.status(202).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/measurements/import
 * Body: { source_url, source_id, metric_name, ... }
 */
export async function importMeasurements(req, res, next) {
  try {
    const data = await anomalyProxy.importMeasurements(req, req.body)
    res.status(202).json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/measurements/config
 * Body: ingestion config updates (free-form object)
 */
export async function updateIngestionConfig(req, res, next) {
  try {
    const data = await anomalyProxy.updateIngestionConfig(req, req.body)
    logger.info({ config: req.body }, 'Ingestion config updated via compositor')
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/models
 */
export async function listModels(req, res, next) {
  try {
    const data = await anomalyProxy.listModels(req)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/anomalies/forecasts/:sensorId
 * Query: ?periods=24&metric_name=voltage&model_id=model_prophet_v1
 */
export async function getForecast(req, res, next) {
  try {
    const data = await anomalyProxy.getForecast(req, req.params.sensorId, {
      periods:    req.query.periods,
      metricName: req.query.metric_name,
      modelId:    req.query.model_id,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}
