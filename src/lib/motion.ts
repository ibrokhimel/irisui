import type { Transition, Variants } from 'motion/react'

/**
 * IrisUI motion vocabulary. One spring family for UI state changes
 * (interruptible by nature), used everywhere so the app moves as one system.
 * Reduced motion is handled in three layers: MotionConfig reducedMotion="user"
 * in App, a global CSS kill-switch in index.css, and useReducedMotion gates
 * on the imperative paths (count-up, scrollIntoView, recharts).
 */

export const SPRING: Transition = { type: 'spring', stiffness: 300, damping: 26 }
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 200, damping: 28 }

/** Standard entrance: fade + rise. Use with a per-index delay for cascades. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

/** Modal / popover entrance. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
}

/** Per-index cascade delay (entrance choreography, ~60ms steps). */
export const stagger = (index: number, base = 0): Transition => ({
  ...SPRING,
  delay: base + index * 0.06,
})

/** Standard tap feedback for buttons. */
export const TAP = { scale: 0.96 }

/** Standard hover lift for cards/chips. */
export const LIFT = { y: -2 }
