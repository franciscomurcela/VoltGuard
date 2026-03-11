export default function Sparkline({ data = [], color = 'var(--accent-blue)', width = 120, height = 30 }) {
  if (!data.length) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).slice(2, 6)}`

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 2) - 1
      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {data.length > 0 && (() => {
        const lastVal = data[data.length - 1]
        const cx = width
        const cy = height - ((lastVal - min) / range) * (height - 2) - 1
        return (
          <>
            <circle cx={cx} cy={cy} r="3" fill={color} opacity="0.3">
              <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={cx} cy={cy} r="1.5" fill={color} />
          </>
        )
      })()}
    </svg>
  )
}
