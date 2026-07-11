import { Check, RotateCcw } from 'lucide-react'
import type { ThemePreset, ThemeSettings } from '../theme'
import { ACCENTS, PRESETS, isValidHex } from '../theme'

export function SettingsAppearance({
  theme,
  onSelectPreset,
  onSelectAccent,
  onReset,
}: {
  theme: ThemeSettings
  onSelectPreset: (preset: ThemePreset) => void
  onSelectAccent: (hex: string) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as Exclude<ThemePreset, 'custom'>[]).map((key) => {
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
        </div>
      </section>

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
