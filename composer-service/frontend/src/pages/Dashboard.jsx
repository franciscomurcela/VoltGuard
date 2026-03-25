import useMetrics from '../hooks/useMetrics'
import useAnomalies from '../hooks/useAnomalies'
import PortugalMap from '../components/map/PortugalMap'
import StatCard from '../components/metrics/StatCard'
import ServiceBadge from '../components/services/ServiceBadge'

const DISTRICT_COLORS = {
  lisboa: '#ef4444',
  porto: '#f97316',
  setubal: '#eab308',
  aveiro: '#22c55e',
  faro: '#0ea5e9',
  braga: '#3b82f6',
  coimbra: '#8b5cf6',
}

export default function Dashboard() {
  const { metrics, districts, serviceHealth, sparklines, loading } = useMetrics()
  const { anomalies, summary: anomalySummary } = useAnomalies()

  if (loading || !metrics) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div
          className="mono"
          style={{ fontSize: 13, color: 'var(--text-faint)', animation: 'pulse 2s ease infinite' }}
        >
          Loading metrics from services...
        </div>
      </div>
    )
  }

  const topDistricts = [...districts].sort((a, b) => b.count - a.count).slice(0, 7)

  return (
    <div className="animate-fade-up">
      {/* ─── Hero: Sensor Summary + Map ─────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 0,
          marginBottom: 24,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Left: Total sensors + district ranking */}
        <div style={{ padding: '32px 36px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Total Sensors</div>
          <div
            className="mono"
            style={{ fontSize: 72, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -2, lineHeight: 1 }}
          >
            {metrics.devicesTotal}
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>
            {metrics.devicesOnline} online · {metrics.devicesOffline ?? (metrics.devicesTotal - metrics.devicesOnline)} offline
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 14 }}>Top Districts by Sensors</div>
            {topDistricts.map((d, i) => (
              <div
                key={d.id}
                className="animate-slide-left"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: DISTRICT_COLORS[d.id] || 'var(--accent-blue)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, width: 140 }}>
                  {d.name}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                  {d.count} sensor{d.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="mono" style={{ marginTop: 16, fontSize: 11, color: 'var(--text-ghost)' }}>
            ▲ 18 Districts · 2 Autonomous Regions
          </div>
        </div>

        {/* Right: Portugal Map */}
        <div
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            position: 'relative',
          }}
        >
          <div
            className="mono"
            style={{
              position: 'absolute',
              top: 12,
              right: 14,
              fontSize: 9,
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Live Heatmap
          </div>
          <PortugalMap districts={districts} />
        </div>
      </div>

      {/* ─── Metric Cards ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Total Sensors"
          value={metrics.devicesTotal}
          sparkData={sparklines.requests}
          color="var(--accent-blue)"
          delay={0}
        />
        <StatCard
          label="Anomalies Detected"
          value={metrics.anomaliesDetected ?? metrics.anomalySummary?.total_anomalies ?? 0}
          sparkData={sparklines.firewall}
          color="var(--accent-orange)"
          delay={80}
        />
        <StatCard
          label="Devices Online"
          value={metrics.devicesOnline}
          subtitle={`of ${metrics.devicesTotal} registered`}
          sparkData={sparklines.devices}
          color="var(--accent-green)"
          delay={160}
        />
        <StatCard
          label="Devices Offline"
          value={metrics.devicesOffline ?? (metrics.devicesTotal - metrics.devicesOnline)}
          sparkData={sparklines.cache}
          color="var(--accent-purple)"
          delay={240}
        />
      </div>

      {/* ─── SOA Services + Notifications ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Service Mesh */}
        <div className="card">
          <div className="label" style={{ marginBottom: 16 }}>SOA Service Mesh</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ServiceBadge
              name="Compositor (self)"
              status={serviceHealth?.compositor?.status}
              latency={serviceHealth?.compositor?.latency}
            />
            <ServiceBadge
              name="OAM Service"
              status={serviceHealth?.oam?.status}
              latency={serviceHealth?.oam?.latency}
            />
            <ServiceBadge
              name="Notification Service"
              status={serviceHealth?.notification?.status}
              latency={serviceHealth?.notification?.latency}
            />
            <ServiceBadge
              name="Anomaly Detection"
              status={serviceHealth?.anomaly?.status}
              latency={serviceHealth?.anomaly?.latency}
            />
          </div>
        </div>

        {/* Anomaly Summary */}
        <div className="card">
          <div className="label" style={{ marginBottom: 16 }}>Anomaly Detection Summary</div>
          {anomalySummary ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
                {[
                  { label: 'Total Anomalies', value: anomalySummary.total_anomalies, color: 'var(--accent-red)' },
                  { label: 'Jobs Completed', value: anomalySummary.jobs_completed, color: 'var(--accent-green)' },
                  { label: 'Jobs Pending', value: anomalySummary.jobs_pending, color: 'var(--accent-yellow)' },
                  { label: 'Jobs Failed', value: anomalySummary.jobs_failed, color: 'var(--text-faint)' },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {anomalies.items?.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: 12 }}>
                  <div className="label" style={{ marginBottom: 8, fontSize: 9 }}>Latest Anomalies</div>
                  {anomalies.items.slice(0, 3).map((a) => (
                    <div key={a.anomaly_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-muted)' }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: a.severity === 'high' || a.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)',
                        flexShrink: 0,
                      }} />
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{a.source_id}</span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 9,
                          color: a.severity === 'critical' ? 'var(--accent-red)' : a.severity === 'high' ? 'var(--accent-orange)' : 'var(--accent-yellow)',
                          padding: '2px 6px',
                          background: a.severity === 'critical' ? 'rgba(239,68,68,0.1)' : a.severity === 'high' ? 'rgba(249,115,22,0.1)' : 'rgba(234,179,8,0.1)',
                          borderRadius: 'var(--radius-sm)',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>No anomaly data available</div>
          )}
        </div>
      </div>
    </div>
  )
}
