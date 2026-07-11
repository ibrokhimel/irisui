/**
 * Pure keyboard-shortcut matching, kept dependency-free so it's unit
 * testable without a DOM (see tests/lib/shortcuts.test.ts). `ctrlOrCmd`
 * matches Ctrl on Windows/Linux or Cmd/Meta on macOS — either satisfies it,
 * neither is "more correct" than the other.
 */

export interface ShortcutSpec {
  /** e.g. 'k', 'o', 'Escape' — compared case-insensitively against event.key */
  key: string
  /** Ctrl (Win/Linux) or Cmd/Meta (macOS) must be held */
  ctrlOrCmd?: boolean
  shift?: boolean
  alt?: boolean
}

/** The subset of KeyboardEvent matchShortcut needs — lets tests pass plain objects. */
export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Exact modifier match — an unlisted modifier held down is treated as "not this shortcut". */
export function matchShortcut(e: ShortcutEvent, spec: ShortcutSpec): boolean {
  if (e.key.toLowerCase() !== spec.key.toLowerCase()) return false
  if ((spec.ctrlOrCmd ?? false) !== (e.ctrlKey || e.metaKey)) return false
  if ((spec.shift ?? false) !== e.shiftKey) return false
  if ((spec.alt ?? false) !== e.altKey) return false
  return true
}

/** Ctrl/Cmd+K — toggle the command palette. Works even while typing. */
export const SHORTCUT_PALETTE: ShortcutSpec = { key: 'k', ctrlOrCmd: true }

/** Ctrl/Cmd+Shift+O — new chat (Shift avoids the browser's plain Ctrl/Cmd+O). */
export const SHORTCUT_NEW_CHAT: ShortcutSpec = { key: 'o', ctrlOrCmd: true, shift: true }

/** Bare Escape — closes dialogs, or stops generation when none are open. */
export const SHORTCUT_ESCAPE: ShortcutSpec = { key: 'Escape' }
