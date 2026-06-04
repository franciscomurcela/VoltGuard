import { useState, useRef, useEffect } from 'react'
import useDevices from '../hooks/useDevices'
import DeviceTable from '../components/devices/DeviceTable'
import DeviceForm from '../components/devices/DeviceForm'
import SensorActionsPanel from '../components/devices/SensorActionsPanel'
import { firmwaresApi } from '../services/api'

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { rows: [], errors: ['CSV file appears to be empty or missing data rows.'] }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const required = ['name', 'district']
  const missing = required.filter((r) => !headers.includes(r))

  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(', ')}. Expected: Name, District (FirmwareID is optional)`],
    }
  }

  const nameIdx = headers.indexOf('name')
  const districtIdx = headers.indexOf('district')
  const firmwareIdx = headers.indexOf('firmwareid')

  const rows = []
  const errors = []

  lines.slice(1).forEach((line, i) => {
    if (!line.trim()) return // skip blank lines
    const cols = line.split(',').map((c) => c.trim())
    const name = cols[nameIdx] || ''
    const district = cols[districtIdx] || ''
    const firmwareId = cols[firmwareIdx] || ''

    const rowErrors = []
    if (!name) rowErrors.push('Name is empty')
    if (!district) rowErrors.push('District is empty')

    rows.push({ _line: i + 2, name, district, firmwareId, _errors: rowErrors })
    if (rowErrors.length) errors.push(`Row ${i + 2}: ${rowErrors.join(', ')}`)
  })

  return { rows, errors }
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────
function CSVImportModal({ rows, errors, onConfirm, onClose, importing, importProgress }) {
  const validRows = rows.filter((r) => r._errors.length === 0)
  const invalidRows = rows.filter((r) => r._errors.length > 0)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && !importing && onClose()}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 12px)',
          width: '100%',
          maxWidth: 680,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Bulk Import Preview
            </h3>
            <p className="mono" style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
              {validRows.length} valid · {invalidRows.length} skipped
            </p>
          </div>
          {!importing && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-faint)',
                fontSize: 20,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Error banner */}
        {errors.length > 0 && (
          <div
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              background: 'var(--accent-red-dim)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: 12,
              color: 'var(--accent-red)',
            }}
          >
            <span style={{ fontWeight: 600 }}>⚠ {errors.length} row{errors.length > 1 ? 's' : ''} will be skipped</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {errors.slice(0, 5).map((e, i) => (
                <li key={i} className="mono" style={{ fontSize: 11, marginTop: 2 }}>{e}</li>
              ))}
              {errors.length > 5 && (
                <li className="mono" style={{ fontSize: 11, marginTop: 2, color: 'var(--text-faint)' }}>
                  …and {errors.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowY: 'auto', padding: '12px 24px', flex: 1, minHeight: 0 }}>
          {validRows.length === 0 ? (
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: 32 }}>
              No valid rows to import.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'Name', 'District', 'FirmwareID'].map((h) => (
                    <th
                      key={h}
                      className="mono"
                      style={{
                        textAlign: 'left',
                        padding: '6px 10px',
                        color: 'var(--text-faint)',
                        fontWeight: 500,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  <th style={{ borderBottom: '1px solid var(--border-subtle)', width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isValid = row._errors.length === 0
                  const isDone = importing && importProgress > i && isValid
                  return (
                    <tr
                      key={i}
                      style={{
                        opacity: isValid ? 1 : 0.45,
                        background: isDone ? 'rgba(34,197,94,0.05)' : 'transparent',
                        transition: 'background 0.3s',
                      }}
                    >
                      <td className="mono" style={{ padding: '7px 10px', color: 'var(--text-faint)', fontSize: 11 }}>
                        {row._line}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>{row.name || '—'}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-secondary, var(--text-faint))' }}>
                        {row.district || '—'}
                      </td>
                      <td className="mono" style={{ padding: '7px 10px', color: 'var(--accent-blue)', fontSize: 11 }}>
                        {row.firmwareId || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        {!isValid ? (
                          <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>skip</span>
                        ) : isDone ? (
                          <span style={{ fontSize: 13, color: 'var(--accent-green)' }}>✓</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Progress bar */}
        {importing && (
          <div style={{ padding: '0 24px 8px' }}>
            <div style={{ height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(importProgress / validRows.length) * 100}%`,
                  background: 'var(--accent-green)',
                  transition: 'width 0.25s ease',
                  borderRadius: 99,
                }}
              />
            </div>
            <p className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0' }}>
              Registering {importProgress} / {validRows.length}…
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-faint)',
              fontSize: 13,
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={importing || validRows.length === 0}
            style={{
              padding: '8px 20px',
              background: 'var(--accent-blue-dim)',
              border: '1px solid rgba(14,165,233,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--accent-blue)',
              fontSize: 13,
              fontWeight: 500,
              cursor: importing || validRows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: validRows.length === 0 ? 0.5 : 1,
            }}
          >
            {importing ? 'Importing…' : `Import ${validRows.length} Sensor${validRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Devices() {
  const { devices, stats, loading, createDevice, deleteDevice, refetch } = useDevices()
  const [firmwares, setFirmwares] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  useEffect(() => {
    firmwaresApi.getAll().then((res) => setFirmwares(res.data ?? [])).catch(() => {})
  }, [])

  // CSV import state
  const [csvRows, setCsvRows] = useState(null)       // parsed rows (null = modal closed)
  const [csvErrors, setCsvErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState(null) // { ok, failed }
  const csvInputRef = useRef(null)

  const handleCreate = async (formData) => {
    await createDevice(formData)
    setShowForm(false)
  }

  const selectedDevice = selectedDeviceId
    ? devices.find((d) => d.id === selectedDeviceId) || null
    : null

  const handleRowClick = (deviceId) => {
    setSelectedDeviceId((prev) => (prev === deviceId ? null : deviceId))
  }

  const handleActionComplete = () => {
    refetch()
  }

  // ── CSV handling ────────────────────────────────────────────────────────────
  const handleCSVFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so same file can be re-selected

    const reader = new FileReader()
    reader.onload = (ev) => {
      const { rows, errors } = parseCSV(ev.target.result)
      setCsvRows(rows)
      setCsvErrors(errors)
      setImportProgress(0)
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  const handleBulkImport = async () => {
    const validRows = csvRows.filter((r) => r._errors.length === 0)
    setImporting(true)
    setImportProgress(0)

    let ok = 0
    let failed = 0

    for (let i = 0; i < validRows.length; i++) {
      const { name, district, firmwareId } = validRows[i]
      try {
        await createDevice({ name, district, firmware_id: firmwareId || null })
        ok++
      } catch {
        failed++
      }
      setImportProgress(i + 1)
    }

    setImporting(false)
    setImportResult({ ok, failed })

    // Auto-close after short delay on full success
    if (failed === 0) {
      setTimeout(() => {
        setCsvRows(null)
        setImportResult(null)
        refetch()
      }, 1200)
    } else {
      refetch()
    }
  }

  const handleCSVModalClose = () => {
    if (importing) return
    setCsvRows(null)
    setCsvErrors([])
    setImportResult(null)
  }

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div
          className="mono"
          style={{ fontSize: 13, color: 'var(--text-faint)', animation: 'pulse 2s ease infinite' }}
        >
          Loading sensor registry...
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            Sensor Registry
          </h2>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            {stats.total} sensors registered · {stats.active} online · {stats.inactive} offline · {stats.warning} anomalies
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* CSV import button */}
          <button
            onClick={() => csvInputRef.current?.click()}
            title="Bulk import sensors from CSV"
            style={{
              padding: '9px 18px',
              background: 'var(--accent-yellow-dim, rgba(234,179,8,0.1))',
              border: '1px solid rgba(234,179,8,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--accent-yellow)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>⇪</span> Import CSV
          </button>

          {/* Hidden file input */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCSVFile}
            style={{ display: 'none' }}
          />

          {/* Register single sensor */}
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '9px 22px',
              background: showForm ? 'var(--accent-red-dim)' : 'var(--accent-blue-dim)',
              border: `1px solid ${showForm ? 'rgba(239,68,68,0.25)' : 'rgba(14,165,233,0.25)'}`,
              borderRadius: 'var(--radius-md)',
              color: showForm ? 'var(--accent-red)' : 'var(--accent-blue)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel' : '+ Register Sensor'}
          </button>
        </div>
      </div>

      {/* Import result toast */}
      {importResult && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: importResult.failed === 0
              ? 'rgba(34,197,94,0.08)'
              : 'var(--accent-red-dim)',
            border: `1px solid ${importResult.failed === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: importResult.failed === 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="mono">
            ✓ {importResult.ok} sensor{importResult.ok !== 1 ? 's' : ''} registered
            {importResult.failed > 0 && ` · ✗ ${importResult.failed} failed`}
          </span>
          <button
            onClick={() => setImportResult(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Online',   value: stats.active,   color: 'var(--accent-green)'  },
          { label: 'Anomaly',  value: stats.warning,  color: 'var(--accent-yellow)' },
          { label: 'Offline',  value: stats.inactive, color: 'var(--text-faint)'    },
          { label: 'Pending',  value: stats.pending,  color: 'var(--accent-blue)'   },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '14px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Registration form */}
      {showForm && (
        <DeviceForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Sensor table */}
      <DeviceTable
        devices={devices}
        firmwares={firmwares}
        onDelete={deleteDevice}
        onRowClick={handleRowClick}
        selectedId={selectedDeviceId}
      />

      {/* Actions panel */}
      {selectedDevice && (
        <SensorActionsPanel
          device={selectedDevice}
          onClose={() => setSelectedDeviceId(null)}
          onActionComplete={handleActionComplete}
        />
      )}

      {/* CSV import modal */}
      {csvRows !== null && (
        <CSVImportModal
          rows={csvRows}
          errors={csvErrors}
          onConfirm={handleBulkImport}
          onClose={handleCSVModalClose}
          importing={importing}
          importProgress={importProgress}
        />
      )}
    </div>
  )
}
