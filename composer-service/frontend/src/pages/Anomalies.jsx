import { useState } from 'react'
import useAnomalies from '../hooks/useAnomalies'
import AnomalyTable from '../components/anomalies/AnomalyTable'
import AnomalyDetail from '../components/anomalies/AnomalyDetail'
import ModelConfig from '../components/anomalies/ModelConfig'

export default function Anomalies() {
  const {
    anomalies,
    summary,
    modelConfig,
    selectedAnomaly,
    loading,
    error,
    fetchAnomalies,
    fetchAnomalyDetail,
    updateModelConfig,
    clearSelected,
  } = useAnomalies()

  const [sourceFilter, setSourceFilter] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const handleFilter = () => {
    fetchAnomalies({ source_id: sourceFilter || undefined })
  }

  const handleSelectAnomaly = async (id) => {
    setDetailError(null)
    try {
      await fetchAnomalyDetail(id)
    } catch (err) {
      setDetailError(err?.response?.data?.message || err.message || `Could not load anomaly ${id}`)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 13, color: 'var(--text-faint)', animation: 'pulse 2s ease infinite' }}>
          Loading anomaly data...
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
            Anomaly Detection
          </h2>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            {anomalies.total || 0} anomalies detected · {summary?.jobs_completed || 0} jobs processed
          </p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          style={{
            padding: '9px 22px',
            background: showConfig ? 'var(--accent-red-dim)' : 'rgba(139,92,246,0.12)',
            border: `1px solid ${showConfig ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.25)'}`,
            borderRadius: 'var(--radius-md)',
            color: showConfig ? 'var(--accent-red)' : 'var(--accent-purple)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showConfig ? 'Close Config' : '⚙ Model Config'}
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Anomalies', value: summary.total_anomalies, color: 'var(--accent-red)' },
            { label: 'Jobs Done', value: summary.jobs_completed, color: 'var(--accent-green)' },
            { label: 'Pending', value: summary.jobs_pending, color: 'var(--accent-yellow)' },
            { label: 'Processing', value: summary.jobs_processing, color: 'var(--accent-blue)' },
            { label: 'Failed', value: summary.jobs_failed, color: 'var(--text-faint)' },
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
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {s.label}
              </span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Model Config Panel */}
      {showConfig && (
        <div style={{ marginBottom: 24 }}>
          <ModelConfig config={modelConfig} onSave={updateModelConfig} />
        </div>
      )}

      {/* List fetch error */}
      {error && (
        <div style={{
          marginBottom: 16,
          padding: '10px 16px',
          background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent-red)' }}>
            ✗ Failed to load anomalies: {error}
          </span>
          <button onClick={() => fetchAnomalies()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            Retry
          </button>
        </div>
      )}

      {/* Detail fetch error */}
      {detailError && (
        <div style={{
          marginBottom: 16,
          padding: '10px 16px',
          background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent-red)' }}>
            ✗ {detailError}
          </span>
          <button onClick={() => setDetailError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Anomaly Detail */}
      {selectedAnomaly && (
        <AnomalyDetail anomaly={selectedAnomaly} onClose={() => { clearSelected(); setDetailError(null) }} />
      )}

      {/* Source Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          placeholder="Filter by source_id (e.g. node_01)"
          style={{ flex: 1, maxWidth: 320 }}
        />
        <button
          onClick={handleFilter}
          style={{
            padding: '8px 18px',
            background: 'var(--accent-blue-dim)',
            border: '1px solid rgba(14,165,233,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-blue)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Filter
        </button>
        {sourceFilter && (
          <button
            onClick={() => { setSourceFilter(''); fetchAnomalies() }}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-faint)',
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Anomaly Table */}
      <AnomalyTable anomalies={anomalies} onSelect={handleSelectAnomaly} />
    </div>
  )
}
