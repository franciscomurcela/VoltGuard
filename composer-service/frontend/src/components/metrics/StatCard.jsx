import AnimCounter from './AnimCounter'
import Sparkline from './Sparkline'

export default function StatCard({ label, value, subtitle, sparkData, color = 'var(--accent-blue)', delay = 0 }) {
  return (
    <div
      className="card animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="label" style={{ marginBottom: 10 }}>
        {label}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: -1,
          lineHeight: 1.1,
        }}
      >
        <AnimCounter target={value} />
      </div>

      {subtitle && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            marginTop: 4,
          }}
        >
          {subtitle}
        </div>
      )}

      {sparkData && (
        <div style={{ marginTop: 14 }}>
          <Sparkline data={sparkData} color={color} />
        </div>
      )}
    </div>
  )
}
