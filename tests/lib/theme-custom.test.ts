import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME, PRESETS, customToVars, loadTheme, saveTheme, seedCustomFromPreset,
} from '../../src/theme'

afterEach(() => vi.unstubAllGlobals())

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

describe('customToVars', () => {
  it('maps all six tokens onto CSS vars', () => {
    const { vars } = customToVars({
      bg: '#101020', panel: '#181828', panel2: '#202038',
      line: '#303048', fg: '#eeeeff', muted: '#9090a0',
    })
    expect(vars['--color-bg']).toBe('#101020')
    expect(vars['--color-panel']).toBe('#181828')
    expect(vars['--color-panel2']).toBe('#202038')
    expect(vars['--color-line']).toBe('#303048')
    expect(vars['--color-fg']).toBe('#eeeeff')
    expect(vars['--color-muted']).toBe('#9090a0')
  })

  it('falls back per-var to the dark preset for missing or invalid values', () => {
    const { vars } = customToVars({ bg: '#101020', panel: 'nope' })
    expect(vars['--color-bg']).toBe('#101020')
    expect(vars['--color-panel']).toBe(PRESETS.dark.vars['--color-panel'])
    expect(vars['--color-fg']).toBe(PRESETS.dark.vars['--color-fg'])
  })

  it('derives the color scheme from the background luminance', () => {
    expect(customToVars({ bg: '#ffffff' }).scheme).toBe('light')
    expect(customToVars({ bg: '#000000' }).scheme).toBe('dark')
    expect(customToVars(undefined).scheme).toBe('dark') // dark-preset fallback bg
  })

  it('normalizes 3-digit hex', () => {
    expect(customToVars({ bg: '#FFF' }).vars['--color-bg']).toBe('#ffffff')
  })
})

describe('seedCustomFromPreset', () => {
  it('copies the preset surface vars into token keys', () => {
    expect(seedCustomFromPreset('wine')).toEqual({
      bg: PRESETS.wine.vars['--color-bg'],
      panel: PRESETS.wine.vars['--color-panel'],
      panel2: PRESETS.wine.vars['--color-panel2'],
      line: PRESETS.wine.vars['--color-line'],
      fg: PRESETS.wine.vars['--color-fg'],
      muted: PRESETS.wine.vars['--color-muted'],
    })
  })
})

describe('load/save round-trip with custom preset', () => {
  it('persists preset custom with its colors', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveTheme({ preset: 'custom', accent: '#2f6feb', custom: { bg: '#101020' } })
    const loaded = loadTheme()
    expect(loaded.preset).toBe('custom')
    expect(loaded.custom?.bg).toBe('#101020')
    expect(loaded.accent).toBe('#2f6feb')
  })

  it('drops invalid custom hexes on load', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({
        preset: 'custom', accent: '#2f6feb',
        custom: { bg: '#101020', panel: 'garbage', fg: 42 },
      }),
    }))
    const loaded = loadTheme()
    expect(loaded.custom).toEqual({ bg: '#101020' })
  })

  it('falls back to the default preset when custom is selected but has no valid colors', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({ preset: 'custom', accent: '#2f6feb', custom: { bg: 'nope' } }),
    }))
    expect(loadTheme().preset).toBe(DEFAULT_THEME.preset)
  })

  it('still loads plain presets unchanged', () => {
    vi.stubGlobal('localStorage', fakeStorage({
      'irisui.theme': JSON.stringify({ preset: 'wine', accent: '#b8404d' }),
    }))
    expect(loadTheme()).toEqual({ preset: 'wine', accent: '#b8404d', custom: undefined })
  })
})
