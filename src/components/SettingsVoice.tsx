import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, VoiceEngine } from '../lib/appSettings'
import { ASR_MODELS, findAsrModel } from '../lib/asrModels'
import { listVoices, speak } from '../lib/tts'

const ENGINE_OPTIONS: { value: VoiceEngine; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: "Browser first, falls back on-device if it's unreachable" },
  { value: 'web', label: 'Browser', hint: "Streams audio to your browser's speech service" },
  { value: 'local', label: 'On-device', hint: 'Private and offline. Transcribes after you stop speaking.' },
]

export function SettingsVoice({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    setVoices(listVoices())
    // getVoices() commonly resolves empty on the very first call — re-poll
    // shortly after mount in addition to listening for 'voiceschanged',
    // since some browsers fire neither reliably.
    const timeoutId = window.setTimeout(() => setVoices(listVoices()), 250)
    const handleChange = () => setVoices(listVoices())
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
    if (supported) window.speechSynthesis.addEventListener('voiceschanged', handleChange)
    return () => {
      window.clearTimeout(timeoutId)
      if (supported) window.speechSynthesis.removeEventListener('voiceschanged', handleChange)
    }
  }, [])

  const voicesByLang = useMemo(() => {
    const map = new Map<string, SpeechSynthesisVoice[]>()
    for (const v of voices) {
      const list = map.get(v.lang) ?? []
      list.push(v)
      map.set(v.lang, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [voices])

  const modelEnabled = settings.voiceEngine !== 'web'
  const currentModel = findAsrModel(settings.asrModel)
  const activeHint = ENGINE_OPTIONS.find((o) => o.value === settings.voiceEngine)?.hint

  const handlePreview = () => {
    setPreviewing(true)
    speak('This is a preview of the selected voice.', () => setPreviewing(false))
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Recognition engine
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {ENGINE_OPTIONS.map((o) => {
            const active = settings.voiceEngine === o.value
            return (
              <button
                key={o.value}
                onClick={() => onUpdate({ voiceEngine: o.value })}
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
        {activeHint && <p className="mt-1.5 text-xs text-muted">{activeHint}</p>}
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Recognition model
        </h3>
        <select
          value={currentModel.id}
          onChange={(e) => onUpdate({ asrModel: e.target.value })}
          disabled={!modelEnabled}
          aria-label="On-device recognition model"
          className="w-full rounded-lg border border-line bg-panel2/40 px-3 py-2 text-sm text-fg outline-none transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ASR_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — ~{m.sizeMb} MB
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">{currentModel.note}</p>
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Read-aloud voice
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={settings.ttsVoiceURI}
            onChange={(e) => onUpdate({ ttsVoiceURI: e.target.value })}
            aria-label="Read-aloud voice"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel2/40 px-3 py-2 text-sm text-fg outline-none transition"
          >
            <option value="">System default</option>
            {voicesByLang.map(([lang, vs]) => (
              <optgroup key={lang} label={lang}>
                {vs.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition hover:border-iris/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewing ? 'Playing…' : 'Preview'}
          </button>
        </div>
      </section>
    </div>
  )
}
