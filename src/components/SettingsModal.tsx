import { useEffect } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import type { ThemePreset, ThemeSettings } from '../theme'
import { ACCENTS, PRESETS, isValidHex } from '../theme'

export function SettingsModal({
  open,
  theme,
  onClose,
  onSelectPreset,
  onSelectAccent,
  onReset,
}: {
  open: boolean
  theme: ThemeSettings
  onClose: () => void
  onSelectPreset: (preset: ThemePreset) => void
  onSelectAccent: (hex: string) => void
  onReset: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close settings"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-fg">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Appearance */}
          <section>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Appearance</h3>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRESETS) as ThemePreset[]).map((key) => {
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

          {/* Accent */}
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

          <div className="flex items-center justify-between border-t border-line pt-4">
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default
            </button>
            <button onClick={onClose} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
