import { useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { AppSettings } from '../lib/appSettings'
import { fetchModels } from '../lib/ollama'

type TestResult = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; count: number } | { kind: 'fail'; message: string }

export function SettingsConnection({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}) {
  const [result, setResult] = useState<TestResult>({ kind: 'idle' })

  const test = async () => {
    setResult({ kind: 'testing' })
    try {
      const models = await fetchModels()
      setResult({ kind: 'ok', count: models.length })
    } catch (e) {
      setResult({ kind: 'fail', message: e instanceof Error ? e.message : 'Connection failed' })
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Ollama host</h3>
        <input
          value={settings.ollamaUrl}
          onChange={(e) => {
            onUpdate({ ollamaUrl: e.target.value })
            setResult({ kind: 'idle' })
          }}
          placeholder="http://localhost:11434"
          spellCheck={false}
          className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg outline-none transition focus:border-iris/50"
        />
        <p className="mt-2 text-xs text-muted">
          Leave blank to use the built-in default. Custom hosts need{' '}
          <span className="font-mono text-fg/80">OLLAMA_ORIGINS</span> CORS config; the built-in
          default uses the dev proxy.
        </p>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void test()}
            disabled={result.kind === 'testing'}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg transition hover:border-iris/40 disabled:opacity-60"
          >
            {result.kind === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Test connection
          </button>

          {result.kind === 'ok' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected · {result.count} model{result.count === 1 ? '' : 's'}
            </span>
          )}
          {result.kind === 'fail' && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-rose-300">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{result.message}</span>
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
