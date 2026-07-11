/**
 * Minimal SVG sparkline. Deliberately hand-rolled: recharts stays lazy-loaded
 * inside StatsPage; the monitor ships in the main bundle and must stay light.
 */
export function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const width = 120
  if (values.length < 2) {
    return <div style={{ height }} aria-hidden />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - 2 - ((v - min) / range) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full text-iris"
      style={{ height }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}
