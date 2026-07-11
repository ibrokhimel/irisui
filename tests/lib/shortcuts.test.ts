import { describe, expect, it } from 'vitest'
import {
  matchShortcut,
  SHORTCUT_ESCAPE,
  SHORTCUT_NEW_CHAT,
  SHORTCUT_PALETTE,
  type ShortcutEvent,
} from '../../src/lib/shortcuts'

function evt(overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides }
}

describe('matchShortcut', () => {
  it('matches Ctrl+K on Windows/Linux', () => {
    expect(matchShortcut(evt({ key: 'k', ctrlKey: true }), SHORTCUT_PALETTE)).toBe(true)
  })

  it('matches Cmd+K on macOS (metaKey)', () => {
    expect(matchShortcut(evt({ key: 'k', metaKey: true }), SHORTCUT_PALETTE)).toBe(true)
  })

  it('is case-insensitive on the key', () => {
    expect(matchShortcut(evt({ key: 'K', ctrlKey: true }), SHORTCUT_PALETTE)).toBe(true)
  })

  it('does not match plain K with no modifier', () => {
    expect(matchShortcut(evt({ key: 'k' }), SHORTCUT_PALETTE)).toBe(false)
  })

  it('does not match Ctrl+Shift+K (extra modifier the spec does not require)', () => {
    expect(matchShortcut(evt({ key: 'k', ctrlKey: true, shiftKey: true }), SHORTCUT_PALETTE)).toBe(
      false,
    )
  })

  it('matches Ctrl+Shift+O for new chat', () => {
    expect(matchShortcut(evt({ key: 'o', ctrlKey: true, shiftKey: true }), SHORTCUT_NEW_CHAT)).toBe(
      true,
    )
  })

  it('matches Cmd+Shift+O for new chat on macOS', () => {
    expect(matchShortcut(evt({ key: 'o', metaKey: true, shiftKey: true }), SHORTCUT_NEW_CHAT)).toBe(
      true,
    )
  })

  it('does not match plain Ctrl+O (avoids the browser Open-file shortcut)', () => {
    expect(matchShortcut(evt({ key: 'o', ctrlKey: true }), SHORTCUT_NEW_CHAT)).toBe(false)
  })

  it('matches Escape with no modifiers', () => {
    expect(matchShortcut(evt({ key: 'Escape' }), SHORTCUT_ESCAPE)).toBe(true)
  })

  it('does not match Escape held with Ctrl', () => {
    expect(matchShortcut(evt({ key: 'Escape', ctrlKey: true }), SHORTCUT_ESCAPE)).toBe(false)
  })

  it('does not match a different key entirely', () => {
    expect(matchShortcut(evt({ key: 'j', ctrlKey: true }), SHORTCUT_PALETTE)).toBe(false)
  })
})
