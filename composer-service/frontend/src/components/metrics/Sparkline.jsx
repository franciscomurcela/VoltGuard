import { useMemo } from 'react'

export default function Sparkline({ data = [], color = 'var(--accent-blue)', width = 120, height = 30 }) {
  const gradientId = useMemo(
    () => `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).slice(2, 6)}`,
    [color]
  )

  // Filter out nulls — only draw real data points
  // Real data grows from the right side of the graph
  const realPoints = data
    .map((v, i) => (v !== null && v !== undefined ? { value: v, index: i } : null))
    .filter(Boolean)

  // Nothing to draw yet — show a flat waiting line
  if (realPoints.length === 0) {
    const midY = height / 2
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        <line
          x1={0} y1={midY} x2={width} y2={midY}
          stroke={color} strokeWidth="1" strokeDasharray="3,4" opacity="0.2"
        />
        <text
          x={width / 2} y={midY - 4}
          textAnchor="middle" fill={color} fontSize="7" opacity="0.3"
          fontFamily="var(--font-mono)"
        >
          awaiting data
        </text>
      </svg>
    )
  }

  // Only 1 point — draw a dot
  if (realPoints.length === 1) {
    const midY = height / 2
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={0} y1={midY} x2={width - 4} y2={midY} stroke={color} strokeWidth="1" strokeDasharray="3,4" opacity="0.15" />
        <circle cx={width} cy={midY} r="2" fill={color}>
          <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    )
  }

  // Multiple points — draw the sparkline
  const values = realPoints.map((p) => p.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const totalSlots = data.length

  // Map each real point to its x position based on its original index
  const pointCoords = realPoints.map((p) => {
    const x = (p.index / (totalSlots - 1)) * width
    const y = height - ((p.value - min) / range) * (height - 4) - 2
    return { x, y }
  })

  const linePoints = pointCoords.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${pointCoords[0].x},${height} ${linePoints} ${pointCoords[pointCoords.length - 1].x},${height}`

  // Last point for the pulsing dot
  const last = pointCoords[pointCoords.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Pulsing dot on latest value */}
      <circle cx={last.x} cy={last.y} r="3" fill={color} opacity="0.25">
        <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={last.x} cy={last.y} r="1.5" fill={color} />
    </svg>
  )
}
