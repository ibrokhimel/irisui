import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Database, MessageSquare, Mic, Palette, Wifi, X } from 'lucide-react'
import type { CustomThemeVars, ThemePreset, ThemeSettings } from '../theme'
import type { AppSettings } from '../lib/appSettings'
import { SPRING } from '../lib/motion'
import { SettingsAppearance } from './SettingsAppearance'
import { SettingsChatDefaults } from './SettingsChatDefaults'
import { SettingsConnection } from './SettingsConnection'
import { SettingsData } from './SettingsData'
import { SettingsVoice } from './SettingsVoice'

type Tab = 'appearance' | 'chat' | 'voice' | 'connection' | 'data'

const TABS: { id: Tab; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'chat', label: 'Chat defaults', icon: MessageSquare },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'connection', label: 'Connection', icon: Wifi },
  { id: 'data', label: 'Data', icon: Database },
]

export function SettingsModal({
  open,
  theme,
  onClose,
  onSelectPreset,
  onSelectAccent,
  onSetCustomVar,
  onSeedCustomFrom,
  onReset,
  appSettings,
  onUpdateAppSettings,
  defaultModel,
  onGoToModels,
  onBeforeWipe,
}: {
  open: boolean
  theme: ThemeSettings
  onClose: () => void
  onSelectPreset: (preset: ThemePreset) => void
  onSelectAccent: (hex: string) => void
  onSetCustomVar: (key: keyof CustomThemeVars, hex: string) => void
  onSeedCustomFrom: (preset: Exclude<ThemePreset, 'custom'>) => void
  onReset: () => void
  appSettings: AppSettings
  onUpdateAppSettings: (patch: Partial<AppSettings>) => void
  defaultModel: string
  onGoToModels: () => void
  onBeforeWipe?: () => void
}) {
  const [tab, setTab] = useState<Tab>('appearance')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
    {open && (
    <m.div
      key="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close settings"
        onClick={onClose}
      />

      <m.div
        className="relative flex max-h-[36rem] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={SPRING}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-fg">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel2 hover:text-fg"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 space-y-0.5 border-r border-line p-2.5">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ' +
                    (active ? 'bg-iris/10 text-iris' : 'text-muted hover:bg-panel2 hover:text-fg')
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t.label}
                </button>
              )
            })}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
            {tab === 'appearance' && (
              <SettingsAppearance
                theme={theme}
                onSelectPreset={onSelectPreset}
                onSelectAccent={onSelectAccent}
                onSetCustomVar={onSetCustomVar}
                onSeedCustomFrom={onSeedCustomFrom}
                onReset={onReset}
              />
            )}
            {tab === 'chat' && (
              <SettingsChatDefaults
                settings={appSettings}
                onUpdate={onUpdateAppSettings}
                defaultModel={defaultModel}
                onGoToModels={onGoToModels}
              />
            )}
            {tab === 'voice' && (
              <SettingsVoice settings={appSettings} onUpdate={onUpdateAppSettings} />
            )}
            {tab === 'connection' && (
              <SettingsConnection settings={appSettings} onUpdate={onUpdateAppSettings} />
            )}
            {tab === 'data' && <SettingsData onBeforeWipe={onBeforeWipe} />}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-line px-5 py-3.5">
          <button onClick={onClose} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
            Done
          </button>
        </div>
      </m.div>
    </m.div>
    )}
    </AnimatePresence>
  )
}
