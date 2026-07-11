/**
 * Theming = CSS custom properties. A preset swaps the surface variables
 * (bg / panel / text / border); the accent picker overrides the accent
 * variables. applyTheme() writes them onto <html>, so every Tailwind utility
 * that reads var(--color-*) recolors live. Preferences persist to localStorage.
 */

export type ThemePreset = 'light' | 'dark' | 'wine' | 'custom'

export interface CustomThemeVars {
  bg: string
  panel: string
  panel2: string
  line: string
  fg: string
  muted: string
}

export interface ThemeSettings {
  preset: ThemePreset
  accent: string
  /** User-picked surface colors; present once the custom theme has been edited. */
  custom?: Partial<CustomThemeVars>
}

export interface AccentSwatch {
  name: string
  value: string
}

type Vars = Record<string, string>

export const PRESETS: Record<Exclude<ThemePreset, 'custom'>, { label: string; scheme: 'light' | 'dark'; vars: Vars }> = {
  light: {
    label: 'Light',
    scheme: 'light',
    vars: {
      '--color-bg': '#f7f5ef',
      '--color-panel': '#efece3',
      '--color-panel2': '#fdfcf9',
      '--color-line': '#e5e1d6',
      '--color-fg': '#2b2a26',
      '--color-muted': '#8a8779',
    },
  },
  dark: {
    label: 'Dark',
    scheme: 'dark',
    vars: {
      '--color-bg': '#1b1a17',
      '--color-panel': '#211f1c',
      '--color-panel2': '#292723',
      '--color-line': '#37342e',
      '--color-fg': '#eceae3',
      '--color-muted': '#9c988d',
    },
  },
  wine: {
    label: 'Wine',
    scheme: 'dark',
    vars: {
      '--color-bg': '#080705',
      '--color-panel': '#100e0c',
      '--color-panel2': '#1a191d',
      '--color-line': '#2c2e37',
      '--color-fg': '#ece7e3',
      '--color-muted': '#8b8d99',
    },
  },
}

export const ACCENTS: AccentSwatch[] = [
  { name: 'Coral', value: '#c96442' },
  { name: 'Amber', value: '#d98324' },
  { name: 'Rose', value: '#e0295e' },
  { name: 'Violet', value: '#7c5cff' },
  { name: 'Blue', value: '#2f6feb' },
  { name: 'Teal', value: '#0e9488' },
  { name: 'Green', value: '#3f9142' },
  { name: 'Wine', value: '#b8404d' },
]

const CUSTOM_TOKEN_MAP = [
  ['bg', '--color-bg'],
  ['panel', '--color-panel'],
  ['panel2', '--color-panel2'],
  ['line', '--color-line'],
  ['fg', '--color-fg'],
  ['muted', '--color-muted'],
] as const

/** Editor rows for Settings → Appearance. */
export const CUSTOM_TOKEN_LABELS: { key: keyof CustomThemeVars; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'panel', label: 'Panel' },
  { key: 'panel2', label: 'Elevated panel' },
  { key: 'line', label: 'Border' },
  { key: 'fg', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
]

/**
 * Resolve user-picked tokens to CSS vars. Missing/invalid entries fall back
 * per-var to the dark preset, and the color scheme follows the background's
 * luminance so form controls / scrollbars match automatically.
 */
export function customToVars(
  custom: Partial<CustomThemeVars> | undefined,
): { vars: Vars; scheme: 'light' | 'dark' } {
  const fallback = PRESETS.dark.vars
  const vars: Vars = {}
  for (const [key, cssVar] of CUSTOM_TOKEN_MAP) {
    const value = custom?.[key]
    vars[cssVar] = typeof value === 'string' && isValidHex(value) ? normalizeHex(value) : fallback[cssVar]
  }
  return { vars, scheme: luminance(vars['--color-bg']) > 0.5 ? 'light' : 'dark' }
}

/** Copy a preset's surface colors into editable custom tokens. */
export function seedCustomFromPreset(preset: Exclude<ThemePreset, 'custom'>): CustomThemeVars {
  const vars = PRESETS[preset].vars
  return {
    bg: vars['--color-bg'],
    panel: vars['--color-panel'],
    panel2: vars['--color-panel2'],
    line: vars['--color-line'],
    fg: vars['--color-fg'],
    muted: vars['--color-muted'],
  }
}

export const DEFAULT_THEME: ThemeSettings = { preset: 'dark', accent: '#c96442' }

export const STORAGE_KEY = 'irisui.theme'

// ── color helpers ─────────────────────────────────────────────────────
function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

/** Mix a hex toward black (amount 0..1) for hover / strong variants. */
function darken(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/** WCAG relative luminance (0..1), used to pick readable on-accent text. */
function luminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex.trim())
}

function normalizeHex(hex: string): string {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return '#' + h.toLowerCase()
}

// ── apply / persist ───────────────────────────────────────────────────
let themeFadeTimer: number | undefined

export function applyTheme(theme: ThemeSettings): void {
  const root = document.documentElement

  // Cross-fade the palette swap (class defined in index.css; reduced motion
  // collapses it via the global media query).
  root.classList.add('theme-fade')
  window.clearTimeout(themeFadeTimer)
  themeFadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), 350)
  const resolved =
    theme.preset === 'custom'
      ? customToVars(theme.custom)
      : (() => {
          const p = PRESETS[theme.preset as Exclude<ThemePreset, 'custom'>] ?? PRESETS.light
          return { vars: p.vars, scheme: p.scheme }
        })()
  for (const [key, value] of Object.entries(resolved.vars)) {
    root.style.setProperty(key, value)
  }
  const accent = isValidHex(theme.accent) ? normalizeHex(theme.accent) : DEFAULT_THEME.accent
  root.style.setProperty('--color-iris', accent)
  root.style.setProperty('--color-iris-strong', darken(accent, 0.14))
  root.style.setProperty('--color-on-accent', luminance(accent) > 0.6 ? '#1c1b18' : '#ffffff')
  root.style.colorScheme = resolved.scheme
}

function sanitizeCustom(raw: unknown): Partial<CustomThemeVars> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: Partial<CustomThemeVars> = {}
  for (const { key } of CUSTOM_TOKEN_LABELS) {
    const v = r[key]
    if (typeof v === 'string' && isValidHex(v)) out[key] = normalizeHex(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>
    const custom = sanitizeCustom(parsed.custom)
    const preset: ThemePreset =
      parsed.preset === 'custom'
        ? custom
          ? 'custom'
          : DEFAULT_THEME.preset
        : parsed.preset && parsed.preset in PRESETS
          ? parsed.preset
          : DEFAULT_THEME.preset
    const accent =
      parsed.accent && isValidHex(parsed.accent) ? normalizeHex(parsed.accent) : DEFAULT_THEME.accent
    return { preset, accent, custom }
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(theme: ThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
