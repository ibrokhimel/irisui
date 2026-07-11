import { useState } from 'react'
import { m } from 'motion/react'
import { Cpu, Download } from 'lucide-react'
import { fadeUp, stagger } from '../lib/motion'
import type { HardwareProfile } from '../lib/hardware'
import { RAM_OPTIONS, detectHardware, loadHardwareProfile, saveHardwareProfile } from '../lib/hardware'
import { recommendModels } from '../lib/recommend'

export function HardwarePanel({
  onPull, pulling, isInstalled, onProfileChange,
}: {
  onPull: (name: string) => void
  pulling: boolean
  isInstalled: (name: string) => boolean
  onProfileChange?: (profile: HardwareProfile) => void
}) {
  const [profile, setProfile] = useState<HardwareProfile | null>(() => loadHardwareProfile() ?? detectHardware())

  const pick = (ramGb: number) => {
    const next: HardwareProfile = { ramGb, cores: profile?.cores ?? null, source: 'manual' }
    setProfile(next)
    saveHardwareProfile(next)
    onProfileChange?.(next)
  }

  const recs = profile ? recommendModels(profile.ramGb) : []

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
        <Cpu className="h-4 w-4 text-iris" />
        Recommended for your machine
      </h2>
      <p className="mb-3 text-xs text-muted">
        Pick your RAM — recommendations and fit badges are estimates based on model size.
        {profile?.source === 'detected' && ' (Detected — browsers under-report RAM, adjust if wrong.)'}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {RAM_OPTIONS.map((gb) => (
          <button
            key={gb}
            onClick={() => pick(gb)}
            className={
              'rounded-full border px-3 py-1 text-xs transition ' +
              (profile?.ramGb === gb
                ? 'border-iris bg-iris/10 text-fg'
                : 'border-line text-muted hover:border-iris/40 hover:text-fg')
            }
          >
            {gb} GB{gb === 128 ? '+' : ''}
          </button>
        ))}
      </div>

      {profile && recs.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recs.map((r, i) => (
            <m.div
              key={r.category}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              transition={stagger(i)}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{r.category}</p>
                <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                <p className="truncate text-xs text-muted">{r.reason}</p>
              </div>
              {isInstalled(r.name) ? (
                <span className="shrink-0 text-xs text-emerald-400">Installed</span>
              ) : (
                <button
                  onClick={() => onPull(r.name)}
                  disabled={pulling}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-iris/40 hover:text-fg disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  Pull
                </button>
              )}
            </m.div>
          ))}
        </div>
      )}
    </section>
  )
}
