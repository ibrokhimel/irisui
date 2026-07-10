/** A radiant starburst mark — IrisUI's spark. Inherits color via currentColor. */
export function Spark({ className = '' }: { className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180
    const inner = 2.6
    const outer = i % 2 === 0 ? 10.5 : 8
    return {
      x1: 12 + Math.cos(a) * inner,
      y1: 12 + Math.sin(a) * inner,
      x2: 12 + Math.cos(a) * outer,
      y2: 12 + Math.sin(a) * outer,
    }
  })

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {rays.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
      ))}
    </svg>
  )
}
