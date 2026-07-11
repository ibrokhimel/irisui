import { ArrowRight, Boxes } from 'lucide-react'
import type { AppSettings } from '../lib/appSettings'
import { EFFORT_OPTIONS, TEMP_MAX, TEMP_MIN, TEMP_STEP } from '../constants'

export function SettingsChatDefaults({
  settings,
  onUpdate,
  defaultModel,
  onGoToModels,
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  defaultModel: string
  onGoToModels: () => void
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Default effort
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {EFFORT_OPTIONS.map((o) => {
            const active = settings.defaultEffort === o.value
            return (
              <button
                key={o.value}
                onClick={() => onUpdate({ defaultEffort: o.value })}
                title={o.hint}
                className={
                  'rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ' +
                  (active
                    ? 'border-iris bg-iris/10 text-fg'
                    : 'border-line text-muted hover:border-iris/40 hover:text-fg')
                }
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Default temperature
          </h3>
          <span className="font-mono text-xs text-fg">{settings.defaultTemperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={TEMP_STEP}
          value={settings.defaultTemperature}
          onChange={(e) => onUpdate({ defaultTemperature: Number(e.target.value) })}
          aria-label="Default temperature"
          className="h-1 w-full cursor-pointer accent-[var(--color-iris)]"
        />
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Default model
        </h3>
        <button
          onClick={onGoToModels}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5 text-left transition hover:border-iris/40"
        >
          <Boxes className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">
              {defaultModel || 'None set'}
            </span>
            <span className="block text-xs text-muted">Set on the Models page</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
      </section>
    </div>
  )
}
