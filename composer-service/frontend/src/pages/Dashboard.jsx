import useMetrics from '../hooks/useMetrics'
import PortugalMap from '../components/map/PortugalMap'
import StatCard from '../components/metrics/StatCard'
import AnimCounter from '../components/metrics/AnimCounter'
import ServiceBadge from '../components/services/ServiceBadge'

const DISTRICT_COLORS = {
  lisboa: '#ef4444',
  porto: '#f97316',
  setubal: '#eab308',
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
  const topDistricts = [...districts].sort((a, b) => b.requests - a.requests).slice(0, 7)

  // Recent notifications (would come from Notification service)
  const notifications = [
    { msg: 'Device DEV-004 pressure anomaly in Faro', time: '2m ago', type: 'warn' },
    { msg: 'OAM config sync completed successfully', time: '8m ago', type: 'ok' },
    { msg: 'New device DEV-008 provisioned in Leiria', time: '15m ago', type: 'info' },
    { msg: 'Anomaly model retrained — accuracy 97.2%', time: '32m ago', type: 'ok' },
  ]

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
        {/* Left: Total requests + district ranking */}
        <div style={{ padding: '32px 36px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Total Requests</div>
          <div
            className="mono"
            style={{ fontSize: 52, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -2, lineHeight: 1 }}
          >
            <AnimCounter target={metrics.totalRequests} />
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>
            {metrics.requestsPerSecond.toLocaleString()}/s
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 14 }}>Top Districts by Requests</div>
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
                  {d.requests.toLocaleString()}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {d.rate.toLocaleString()}/s
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
          label="Total Deployments"
          value={metrics.totalDeployments}
          sparkData={sparklines.requests}
          color="var(--accent-blue)"
          delay={0}
        />
        <StatCard
          label="Firewall Actions"
          value={metrics.firewallActions.total}
          subtitle={`Blocks: ${metrics.firewallActions.systemBlocks.toLocaleString()} · WAF: ${metrics.firewallActions.customWafBlocks.toLocaleString()}`}
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
          label="Cache Hits Served"
          value={metrics.cache.hitsServed}
          subtitle={`${metrics.cache.hitRate}% hit rate`}
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

        {/* Security + Notifications */}
        <div className="card">
          <div className="label" style={{ marginBottom: 16 }}>Security & AI Gateway</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Bot management */}
            <div>
              <div className="label" style={{ marginBottom: 8, fontSize: 9 }}>Bot Management</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bots Blocked</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent-red)' }}>
                  {metrics.botManagement.botsBlocked.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Humans Verified</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                  {metrics.botManagement.humansVerified.toLocaleString()}
                </span>
              </div>
            </div>

            {/* AI Gateway */}
            <div>
              <div className="label" style={{ marginBottom: 8, fontSize: 9 }}>AI Gateway</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Requests</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent-blue)' }}>
                  {metrics.aiGateway.requests.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avg Latency</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent-yellow)' }}>
                  {metrics.aiGateway.avgLatency}ms
                </span>
              </div>
            </div>
          </div>

          {/* Notifications from Notification service */}
          <div style={{ marginTop: 20 }}>
            <div className="label" style={{ marginBottom: 10, fontSize: 9 }}>Recent Notifications</div>
            {notifications.map((n, i) => {
              const dotColor = n.type === 'warn' ? 'var(--accent-yellow)' : n.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-blue)'
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--border-muted)',
                  }}
                >
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, lineHeight: 1.3 }}>{n.msg}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{n.time}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
