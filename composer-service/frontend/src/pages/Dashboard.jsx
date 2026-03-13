import useMetrics from '../hooks/useMetrics'
import PortugalMap from '../components/map/PortugalMap'
import StatCard from '../components/metrics/StatCard'
import AnimCounter from '../components/metrics/AnimCounter'
import ServiceBadge from '../components/services/ServiceBadge'

const DISTRICT_COLORS = {
  lisboa: '#ef4444',
  porto: '#f97316',
  setúbal: '#eab308',
  aveiro: '#22c55e',
  faro: '#0ea5e9',
  braga: '#0ea5e9',
  coimbra: '#8b5cf6',
}

export default function Dashboard() {
  const { metrics, districts, serviceHealth, sparklines, loading } = useMetrics()

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

  // Top 7 districts for the sidebar ranking
  const topDistricts = [...districts].sort((a, b) => b.count - a.count).slice(0, 7)

  return (
    <div className="animate-fade-up">
      {/* ─── Hero: Stats + Map ──────────────────────────────────────────── */}
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
            style={{ fontSize: 52, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -2, lineHeight: 1 }}
          >
            <AnimCounter target={metrics.devicesTotal} />
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>
            {metrics.devicesOnline} online · {metrics.devicesOffline} offline
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
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, width: 110 }}>
                  {d.name}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                  {d.count.toLocaleString()} sensors
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
          value={metrics.anomaliesDetected}
          sparkData={sparklines.firewall}
          color="var(--accent-orange)"
          delay={80}
        />
        <StatCard
          label="Devices Online"
          value={metrics.devicesOnline}
          subtitle={`of ${metrics.devicesTotal.toLocaleString()} registered`}
          sparkData={sparklines.devices}
          color="var(--accent-green)"
          delay={160}
        />
        <StatCard
          label="Devices Offline"
          value={metrics.devicesOffline}
          sparkData={sparklines.cache}
          color="var(--accent-purple)"
          delay={240}
        />
      </div>

      {/* ─── SOA Services + Sensor Summary ──────────────────────────────── */}
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

          {/* Degradation alert */}
          {serviceHealth?.anomaly?.status === 'degraded' && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                background: 'var(--accent-yellow-dim)',
                border: '1px solid rgba(234,179,8,0.18)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--accent-yellow)', fontWeight: 500 }}>
                ⚠ Anomaly Service Degraded
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Latency spike detected · Model inference queue at high capacity
              </div>
            </div>
          )}
        </div>

        {/* Sensor Summary */}
        <div className="card">
          <div className="label" style={{ marginBottom: 16 }}>Sensor Summary</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Registered</span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {metrics.devicesTotal}
              </span>
            </div>

            <div
              style={{
                height: 1,
                background: 'var(--border-muted)',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Online</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-green)' }}>
                {metrics.devicesOnline}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Offline</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-faint)' }}>
                {metrics.devicesOffline}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>With Anomaly</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-orange)' }}>
                {metrics.anomaliesDetected}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
