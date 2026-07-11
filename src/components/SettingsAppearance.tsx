import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, SwatchBook } from 'lucide-react'
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
import { ACCENTS, CUSTOM_TOKEN_LABELS, CUSTOM_TOKEN_MAP, PRESETS, customToVars, isValidHex } from '../theme'

type ConcretePreset = Exclude<ThemePreset, 'custom'>

// Only a complete 6-digit hex is unambiguous while the user is still typing —
// the first 3 characters of any 6-digit value are themselves a valid 3-digit
// shorthand, so auto-committing on 3-digit input would expand/corrupt the
// field mid-keystroke. Shorthand is accepted only on blur/Enter, where intent
// is unambiguous.
const COMPLETE_HEX_RE = /^#?[0-9a-fA-F]{6}$/

// Normalize for commit: trim first, THEN check for a leading '#'. Committing
// the untrimmed string (e.g. " 1a0b2e" -> "# 1a0b2e") passes trimmed
// validation but produces a value every downstream consumer rejects, so the
// trimmed string must be what actually gets committed, not just what gets
// validated.
function toHex(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

function TokenRow({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  // Draft always mirrors exactly what the user typed, so the field never
  // jumps to a normalized/expanded value mid-typing.
  const [draft, setDraft] = useState<string | null>(null)
  // Rows are keyed by a stable token key and stay mounted across theme
  // changes (e.g. "Start from: <preset>" reseeds all six custom colors in
  // place). This tracks the hex this row itself last committed, so the
  // resync effect below can tell "value changed because we just committed
  // it" apart from "value changed out from under us" — only the latter
  // should discard an in-progress draft.
  const lastCommitted = useRef<string | null>(null)

  // If `value` changes for a reason other than this row's own commit, any
  // held draft is stale: drop it so the field falls back to the real value
  // instead of silently overwriting the reseeded/updated color on the next
  // blur. Typing alone never changes `value` (only onChange does), so this
  // only fires on an external change, keeping in-progress typing intact.
  useEffect(() => {
    if (value.toLowerCase() !== lastCommitted.current) {
      setDraft(null)
    }
  }, [value])

  const commit = (raw: string) => {
    const hex = toHex(raw)
    // Store lowercased: `value` comes back through theme.ts's normalizeHex,
    // which lowercases, so comparing against the raw (possibly uppercase)
    // committed string would misclassify this row's own echo as an external
    // change for any hex containing A-F and wrongly clear the live draft.
    lastCommitted.current = hex.toLowerCase()
    onChange(hex)
  }

  const handleTyping = (v: string) => {
    setDraft(v)
    if (COMPLETE_HEX_RE.test(v.trim())) {
      commit(v)
    }
  }

  const finalizeDraft = () => {
    if (draft === null) return
    if (isValidHex(draft)) {
      commit(draft)
    }
    setDraft(null)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            lastCommitted.current = e.target.value.toLowerCase()
            onChange(e.target.value)
            setDraft(null)
          }}
          aria-label={`${label} color`}
          className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
        />
        <input
          type="text"
          value={draft ?? value}
          onChange={(e) => handleTyping(e.target.value)}
          onBlur={finalizeDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finalizeDraft()
          }}
          spellCheck={false}
          aria-label={`${label} hex value`}
          className="w-24 rounded-lg border border-line bg-panel2 px-2 py-1 font-mono text-xs text-fg outline-none focus:border-iris"
        />
      </span>
    </div>
  )
}

export function SettingsAppearance({
  theme,
  onSelectPreset,
  onSelectAccent,
  onSetCustomVar,
  onSeedCustomFrom,
  onReset,
}: {
  theme: ThemeSettings
  onSelectPreset: (preset: ThemePreset) => void
  onSelectAccent: (hex: string) => void
  onSetCustomVar: (key: keyof CustomThemeVars, hex: string) => void
  onSeedCustomFrom: (preset: ConcretePreset) => void
  onReset: () => void
}) {
  // Resolved custom vars power both the Custom card's preview swatch and the
  // editor's current values (per-var dark fallback applies until edited).
  const resolvedCustom = customToVars(
    theme.custom ??
      (theme.preset !== 'custom'
        ? {
            bg: PRESETS[theme.preset].vars['--color-bg'],
            panel2: PRESETS[theme.preset].vars['--color-panel2'],
          }
        : undefined),
  ).vars
  const customActive = theme.preset === 'custom'

  const tokenValue = (key: keyof CustomThemeVars): string => {
    const cssVar = CUSTOM_TOKEN_MAP.find(([k]) => k === key)?.[1] ?? '--color-bg'
    return resolvedCustom[cssVar]
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as ConcretePreset[]).map((key) => {
            const preset = PRESETS[key]
            const active = theme.preset === key
            return (
              <button
                key={key}
                onClick={() => onSelectPreset(key)}
                className={
                  'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition ' +
                  (active ? 'border-iris ring-1 ring-iris' : 'border-line hover:border-iris/50')
                }
              >
                <div className="flex h-10 overflow-hidden rounded-lg border border-line">
                  <span className="w-1/2" style={{ background: preset.vars['--color-bg'] }} />
                  <span className="w-1/2" style={{ background: preset.vars['--color-panel2'] }} />
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-fg">
                  {preset.label}
                  {active && <Check className="h-3 w-3 text-iris" />}
                </span>
              </button>
            )
          })}

          <button
            onClick={() => onSelectPreset('custom')}
            className={
              'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition ' +
              (customActive ? 'border-iris ring-1 ring-iris' : 'border-line hover:border-iris/50')
            }
          >
            <div className="flex h-10 overflow-hidden rounded-lg border border-line">
              <span className="w-1/2" style={{ background: resolvedCustom['--color-bg'] }} />
              <span className="w-1/2" style={{ background: resolvedCustom['--color-panel2'] }} />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-fg">
              <SwatchBook className="h-3 w-3" />
              Custom
              {customActive && <Check className="h-3 w-3 text-iris" />}
            </span>
          </button>
        </div>
      </section>

      {customActive && (
        <section>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Custom colors
          </h3>
          <div className="space-y-2.5 rounded-xl border border-line bg-panel2/40 p-3">
            {CUSTOM_TOKEN_LABELS.map(({ key, label }) => (
              <TokenRow
                key={key}
                label={label}
                value={tokenValue(key)}
                onChange={(hex) => onSetCustomVar(key, hex)}
              />
            ))}
            <div className="flex items-center gap-2 border-t border-line pt-2.5">
              <span className="text-xs text-muted">Start from:</span>
              {(Object.keys(PRESETS) as ConcretePreset[]).map((key) => (
                <button
                  key={key}
                  onClick={() => onSeedCustomFrom(key)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-iris/40 hover:text-fg"
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Accent color</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((swatch) => {
            const active = theme.accent.toLowerCase() === swatch.value.toLowerCase()
            return (
              <button
                key={swatch.value}
                onClick={() => onSelectAccent(swatch.value)}
                title={swatch.name}
                aria-label={swatch.name}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110"
                style={{
                  backgroundColor: swatch.value,
                  boxShadow: active
                    ? '0 0 0 2px var(--color-panel), 0 0 0 4px ' + swatch.value
                    : undefined,
                }}
              >
                {active && <Check className="h-4 w-4 text-white" />}
              </button>
            )
          })}

          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs text-muted transition hover:border-iris/50 hover:text-fg">
            Custom
            <input
              type="color"
              value={isValidHex(theme.accent) ? theme.accent : '#c96442'}
              onChange={(e) => onSelectAccent(e.target.value)}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Custom accent color"
            />
          </label>
        </div>
      </section>

      <button
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset to default
      </button>
    </div>
  )
}
