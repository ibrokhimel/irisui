/**
 * Motion feature bundle, loaded lazily so the animation engine lives in its
 * own code-split chunk instead of the main bundle. domMax includes layout
 * animations (FLIP reflows, the gliding active-chat ring).
 */
export { domMax as default } from 'motion/react'
