import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Animated count-up: eases to `target` with cubic ease-out, re-ticks from the
 * CURRENT value on change (never snaps back to 0). Reduced motion jumps
 * instantly — a real code path, not a shorter duration.
 */
export function useCountUp(target: number, duration = 800): number {
  const value = Number(target) || 0
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      fromRef.current = value
      setDisplay(value)
      return undefined
    }
    const from = fromRef.current
    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduced])

  return display
}
