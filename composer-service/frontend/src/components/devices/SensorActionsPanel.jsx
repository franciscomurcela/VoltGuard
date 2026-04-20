import { useState, useEffect, useRef } from 'react'
import { sensorActionsApi, firmwaresApi } from '../../services/api'
import useSensorAnomalyStats from '../../hooks/useSensorAnomalyStats'
import useForecasts from '../../hooks/useForecasts'

const STATUS_META = {
  active:   { label: 'Active',   color: 'var(--accent-green)'  },
  warning:  { label: 'Warning',  color: 'var(--accent-yellow)' },
  inactive: { label: 'Inactive', color: 'var(--text-faint)'    },
  pending:  { label: 'Pending',  color: 'var(--accent-blue)'   },
}

// ─── Feedback toast ───────────────────────────────────────────────────────────

function Feedback({ feedback }) {
  if (!feedback) return null
  const ok = feedback.type === 'ok'
  return (
    <div style={{
      padding: '8px 14px',
      background: ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      borderRadius: 'var(--radius-md)',
      animation: 'fadeIn 0.2s ease',
    }}>
      <span className="mono" style={{ fontSize: 12, color: ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {ok ? '✓ ' : '✗ '}{feedback.msg}
      </span>
    </div>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ label, sub, color, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '10px 14px',
        background: disabled ? 'rgba(255,255,255,0.02)' : `${color}0d`,
        border: `1px solid ${disabled ? 'var(--border-subtle)' : `${color}28`}`,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s',
        width: '100%',
      }}
      onMouseEnter={(e) => { if (!disabled && !loading) e.currentTarget.style.borderColor = `${color}55` }}
      onMouseLeave={(e) => { if (!disabled && !loading) e.currentTarget.style.borderColor = `${color}28` }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: disabled ? 'var(--text-faint)' : color }}>
        {loading ? 'Scheduling…' : label}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 2 }}>{sub}</div>
      )}
    </button>
  )
}

// ─── Firmware upload form ─────────────────────────────────────────────────────

function FirmwareUploadForm({ onDone, onCancel }) {
  const [file, setFile]         = useState(null)
  const [version, setVersion]   = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState(null)
  const fileRef = useRef(null)

  const isValid = file && version.trim()

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setError(null) }
  }

  const handleSubmit = async () => {
    if (!isValid || uploading) return
    setUploading(true)
    setError(null)
    try {
      await firmwaresApi.upload(file, version.trim())
      onDone()
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      padding: 14,
      background: 'rgba(14,165,233,0.04)',
      border: '1px solid rgba(14,165,233,0.14)',
      borderRadius: 'var(--radius-md)',
      marginTop: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 10 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '9px 12px',
            border: `1px dashed ${dragging ? 'rgba(14,165,233,0.6)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-md)',
            background: dragging ? 'rgba(14,165,233,0.06)' : 'var(--bg-inset)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <input
            ref={fileRef} type="file" accept=".bin" style={{ display: 'none' }}
            onChange={(e) => { setFile(e.target.files[0] || null); setError(null) }}
          />
          <span style={{ fontSize: 14 }}>{file ? '📦' : '📂'}</span>
          {file
            ? <span className="mono" style={{ fontSize: 11, color: 'var(--accent-blue)' }}>{file.name}</span>
            : <span className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Drop .bin or click</span>
          }
        </div>
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g. 1.4.2"
          style={{ fontSize: 12 }}
        />
      </div>

      {error && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--accent-red)', marginBottom: 8 }}>
          ✗ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!isValid || uploading}
          style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 500,
            background: !isValid ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#0ea5e9,#0284c7)',
            color: !isValid ? 'var(--text-faint)' : '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: !isValid ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Uploading…' : '↑ Upload'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 12px', fontSize: 12,
            background: 'transparent', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-faint)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Anomaly Stats Panel (2.2) ────────────────────────────────────────────────

function AnomalyStatsPanel({ sensorId }) {
  const { stats, loading, error, refetch } = useSensorAnomalyStats(sensorId)

  const PROCESSING_STATUS_COLORS = {
    completed: 'var(--accent-green)',
    processing: 'var(--accent-blue)',
    failed: 'var(--accent-red)',
    pending: 'var(--accent-yellow)',
    unknown: 'var(--text-ghost)',
  }

  return (
    <div style={{
      padding: '16px 20px',
      borderTop: '1px solid var(--border-muted)',
      background: 'rgba(255,255,255,0.008)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="label" style={{ fontSize: 9 }}>Anomaly Analysis Stats</div>
        <button
          onClick={refetch}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-ghost)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Loading stats…</div>
      )}

      {error && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--accent-red)' }}>✗ {error}</div>
      )}

      {!loading && !error && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Measurements', value: stats.totalMeasurements, color: 'var(--accent-blue)' },
            { label: 'Anomalies', value: stats.totalAnomalies, color: 'var(--accent-red)' },
            { label: 'Anomaly Ratio', value: stats.ratio, color: 'var(--accent-yellow)' },
            {
              label: 'Last Processing',
              value: stats.lastProcessing?.status ?? 'unknown',
              sub: stats.lastProcessing?.updated_at
                ? new Date(stats.lastProcessing.updated_at).toLocaleTimeString()
                : null,
              color: PROCESSING_STATUS_COLORS[stats.lastProcessing?.status] ?? 'var(--text-ghost)',
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: '10px 14px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                {s.label}
              </div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
              {s.sub && (
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-ghost)', marginTop: 2 }}>{s.sub}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Forecast Panel (2.4) ─────────────────────────────────────────────────────

const METRIC_OPTIONS = ['voltage', 'current', 'power_factor', 'active_power', 'reactive_power']
const PERIOD_OPTIONS = [6, 12, 24, 48, 72]

function ForecastPanel({ sensorId }) {
  const { forecast, loading, error, fetchForecast, clearForecast } = useForecasts()
  const [open, setOpen] = useState(false)
  const [periods, setPeriods] = useState(24)
  const [metric, setMetric] = useState('voltage')

  const handleFetch = () => fetchForecast(sensorId, { periods, metric_name: metric })

  const toggle = () => {
    if (open) { clearForecast(); setOpen(false) }
    else { setOpen(true); fetchForecast(sensorId, { periods, metric_name: metric }) }
  }

  return (
    <div style={{
      padding: '0 20px 16px',
      borderTop: '1px solid var(--border-muted)',
      paddingTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 14 : 0 }}>
        <div className="label" style={{ fontSize: 9 }}>Forecast</div>
        <button
          onClick={toggle}
          style={{
            padding: '3px 12px', fontSize: 11,
            background: open ? 'var(--accent-red-dim)' : 'rgba(139,92,246,0.1)',
            border: `1px solid ${open ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.25)'}`,
            borderRadius: 'var(--radius-sm)',
            color: open ? 'var(--accent-red)' : 'var(--accent-purple)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {open ? 'Close' : '▾ Show Forecast'}
        </button>
      </div>

      {open && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 3, fontSize: 9 }}>Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                style={{ fontSize: 11 }}
              >
                {METRIC_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 3, fontSize: 9 }}>Periods (h)</label>
              <select
                value={periods}
                onChange={(e) => setPeriods(Number(e.target.value))}
                style={{ fontSize: 11 }}
              >
                {PERIOD_OPTIONS.map((p) => <option key={p} value={p}>{p}h</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleFetch}
                disabled={loading}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 500,
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent-purple)',
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {loading ? 'Loading…' : '↻ Fetch'}
              </button>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 10,
            }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent-red)' }}>✗ {error}</span>
            </div>
          )}

          {/* Forecast table */}
          {!error && forecast && (
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-ghost)', marginBottom: 6 }}>
                {forecast.metric_name} · model: {forecast.model_id} · trained: {forecast.last_training ? new Date(forecast.last_training).toLocaleDateString() : '—'}
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Timestamp', 'Forecast', 'Lower', 'Upper'].map((h) => (
                        <th key={h} className="mono" style={{
                          textAlign: 'left', padding: '4px 10px', fontSize: 9,
                          color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 0.8,
                          borderBottom: '1px solid var(--border-subtle)', fontWeight: 500,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(forecast.forecasts ?? []).map((row, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ padding: '5px 10px', color: 'var(--text-faint)', fontSize: 10 }}>
                          {new Date(row.timestamp).toLocaleString()}
                        </td>
                        <td className="mono" style={{ padding: '5px 10px', color: 'var(--accent-purple)', fontWeight: 600 }}>
                          {typeof row.yhat === 'number' ? row.yhat.toFixed(3) : '—'}
                        </td>
                        <td className="mono" style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>
                          {typeof row.yhat_lower === 'number' ? row.yhat_lower.toFixed(3) : '—'}
                        </td>
                        <td className="mono" style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>
                          {typeof row.yhat_upper === 'number' ? row.yhat_upper.toFixed(3) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(forecast.forecasts ?? []).length === 0 && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)', textAlign: 'center', padding: 16 }}>
                  No forecast data returned.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function SensorActionsPanel({ device, onClose, onActionComplete }) {
  const [firmwares, setFirmwares]         = useState([])
  const [loadingFw, setLoadingFw]         = useState(true)
  const [selectedFw, setSelectedFw]       = useState('')
  const [showUpload, setShowUpload]       = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [feedback, setFeedback]           = useState(null)

  const loadFirmwares = async () => {
    setLoadingFw(true)
    try {
      const res = await firmwaresApi.getAll()
      const list = res.data ?? []
      setFirmwares(list)
      if (list.length && !selectedFw) setSelectedFw(list[0].id)
    } catch {
      setFirmwares([])
    } finally {
      setLoadingFw(false)
    }
  }

  useEffect(() => { loadFirmwares() }, [device?.id])

  const showMsg = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const dispatch = async (key, fn, successMsg) => {
    setActionLoading(key)
    try {
      await fn()
      showMsg('ok', successMsg)
      onActionComplete?.()
    } catch (err) {
      showMsg('err', err?.response?.data?.message || err.message || 'Request failed')
    } finally {
      setActionLoading(null)
    }
  }

  if (!device) return null

  const status    = STATUS_META[device.status] ?? { label: device.status, color: 'var(--text-muted)' }
  const hasAnomaly = device.anomalyStatus === 'DETECTED'
  const isOffline  = device.status === 'inactive'
  const busy      = !!actionLoading

  return (
    <div
      className="animate-fade-up"
      style={{
        marginTop: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: 'none',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: status.color, boxShadow: `0 0 6px ${status.color}60`,
          }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.2 }}>
              {device.name}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-ghost)' }}>{device.id}</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{device.district}</span>
              <span className="mono" style={{ fontSize: 10, color: status.color }}>{status.label}</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '4px 10px', fontSize: 12,
            background: 'transparent', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-faint)', cursor: 'pointer',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Offline warning ──────────────────────────────────────────────── */}
      {isOffline && (
        <div style={{
          padding: '10px 20px',
          background: 'rgba(234,179,8,0.06)',
          borderBottom: '1px solid rgba(234,179,8,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent-yellow)' }}>
            Device is offline. Actions will be scheduled in the DB and delivered on the next keepalive when it comes back online.
          </span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 20 }}>

        {/* Col 1 — Device Control */}
        <div>
          <div className="label" style={{ marginBottom: 10 }}>Device Control</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionBtn
              label="Reboot"
              sub="Executes on next keepalive"
              color="var(--accent-blue)"
              loading={actionLoading === 'reboot'}
              disabled={busy && actionLoading !== 'reboot'}
              onClick={() => dispatch('reboot', () => sensorActionsApi.reboot(device.id), 'Reboot scheduled — will execute on next keepalive.')}
            />
            {hasAnomaly ? (
              <ActionBtn
                label="Clear Anomaly"
                sub="Resets anomaly_status to NONE"
                color="var(--accent-yellow)"
                loading={actionLoading === 'anomaly'}
                disabled={busy && actionLoading !== 'anomaly'}
                onClick={() => dispatch('anomaly', () => sensorActionsApi.clearAnomaly(device.id), 'Anomaly cleared — sensor status reset to normal.')}
              />
            ) : (
              <div style={{
                padding: '10px 14px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.01)',
              }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>No active anomaly</div>
              </div>
            )}
          </div>
        </div>

        {/* Col 2 — Firmware Update */}
        <div>
          <div className="label" style={{ marginBottom: 10 }}>Schedule OTA Update</div>

          {loadingFw ? (
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-ghost)' }}>Loading…</div>
          ) : firmwares.length === 0 ? (
            <div style={{
              padding: '10px 14px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.01)',
            }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)' }}>No firmwares available.</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>Upload one →</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Target version</label>
                <select
                  value={selectedFw}
                  onChange={(e) => setSelectedFw(e.target.value)}
                  disabled={busy}
                  style={{ width: '100%', fontSize: 12 }}
                >
                  {firmwares.map((fw) => (
                    <option key={fw.id} value={fw.id}>
                      v{fw.version} · {new Date(fw.uploaded_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              <ActionBtn
                label="Schedule Update"
                sub="Stages firmware — schedule a Reboot to apply"
                color="var(--accent-orange)"
                loading={actionLoading === 'firmware'}
                disabled={(busy && actionLoading !== 'firmware') || !selectedFw}
                onClick={() => dispatch(
                  'firmware',
                  () => sensorActionsApi.updateFirmware(device.id, selectedFw),
                  'Firmware staged — schedule a Reboot to apply.'
                )}
              />
            </div>
          )}
        </div>

        {/* Col 3 — Firmware Registry */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="label">Firmware Registry</div>
            <button
              onClick={() => setShowUpload((v) => !v)}
              style={{
                padding: '3px 10px', fontSize: 11,
                background: showUpload ? 'var(--accent-red-dim)' : 'var(--accent-blue-dim)',
                border: `1px solid ${showUpload ? 'rgba(239,68,68,0.25)' : 'rgba(14,165,233,0.25)'}`,
                borderRadius: 'var(--radius-sm)',
                color: showUpload ? 'var(--accent-red)' : 'var(--accent-blue)',
                cursor: 'pointer',
              }}
            >
              {showUpload ? 'Cancel' : '+ Upload'}
            </button>
          </div>

          {showUpload && (
            <FirmwareUploadForm
              onDone={async () => { setShowUpload(false); await loadFirmwares() }}
              onCancel={() => setShowUpload(false)}
            />
          )}

          {!showUpload && (
            loadingFw ? (
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-ghost)' }}>Loading…</div>
            ) : firmwares.length === 0 ? (
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-ghost)', padding: '10px 0' }}>
                No firmware images uploaded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {firmwares.map((fw) => (
                  <div
                    key={fw.id}
                    onClick={() => setSelectedFw(fw.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: selectedFw === fw.id ? 'rgba(14,165,233,0.06)' : 'var(--bg-inset)',
                      border: `1px solid ${selectedFw === fw.id ? 'rgba(14,165,233,0.2)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)' }}>
                        v{fw.version}
                      </span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-ghost)', marginLeft: 8 }}>
                        {new Date(fw.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                    <a
                      href={firmwaresApi.getDownloadUrl(fw.id)}
                      download
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 10, fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-blue)', opacity: 0.6, textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                    >
                      ↓
                    </a>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Feedback bar ────────────────────────────────────────────────── */}
      {feedback && (
        <div style={{ padding: '0 20px 16px' }}>
          <Feedback feedback={feedback} />
        </div>
      )}

      {/* ── Anomaly Stats (2.2) ──────────────────────────────────────────── */}
      <AnomalyStatsPanel sensorId={device.id} />

      {/* ── Forecast (2.4) ──────────────────────────────────────────────── */}
      <ForecastPanel sensorId={device.id} />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px',
        borderTop: '1px solid var(--border-muted)',
        background: 'rgba(255,255,255,0.005)',
      }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-ghost)' }}>
          Reboot is delivered on the next keepalive · firmware update is staged and applied when the device reboots
        </span>
      </div>
    </div>
  )
}
