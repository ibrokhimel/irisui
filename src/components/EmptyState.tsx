import type { ReactNode } from 'react'
import { Aperture, Terminal, WifiOff } from 'lucide-react'
import type { OllamaStatus } from '../types'
import { EXAMPLE_PROMPTS } from '../constants'

export function EmptyState({
  status,
  onPickPrompt,
}: {
  status: OllamaStatus
  onPickPrompt: (prompt: string) => void
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-6">
        <div
          className="absolute inset-0 -z-10 blur-2xl"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--color-iris) 32%, transparent), transparent 70%)',
          }}
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-panel2">
          <Aperture className="h-8 w-8 text-iris" />
        </div>
      </div>

      <h1 className="bg-gradient-to-r from-[var(--color-iris)] to-[var(--color-iris-strong)] bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
        IrisUI
      </h1>
      <p className="mt-2 text-[15px] text-muted">Chat with your local Ollama models.</p>

      {status === 'online' && (
        <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPickPrompt(prompt)}
              className="group rounded-xl border border-line bg-panel/60 px-4 py-3 text-left text-sm text-fg/90 transition hover:border-iris/40 hover:bg-panel2"
            >
              <span className="mr-1.5 text-muted transition group-hover:text-iris">›</span>
              {prompt}
            </button>
          ))}
        </div>
      )}

      {status === 'no-models' && (
        <Notice icon={<Terminal className="h-4 w-4 text-amber-400" />} title="No Ollama models installed">
          <p className="text-muted">Pull one to get started:</p>
          <CodeLine>ollama pull llama3.1:8b</CodeLine>
        </Notice>
      )}

      {status === 'offline' && (
        <Notice icon={<WifiOff className="h-4 w-4 text-rose-400" />} title="Ollama is offline">
          <p className="text-muted">Start Ollama, then refresh IrisUI.</p>
          <p className="mt-2 text-muted">
            For a one-command dev start (launches Ollama + IrisUI together):
          </p>
          <CodeLine>npm run dev:ollama</CodeLine>
        </Notice>
      )}

      {status === 'checking' && (
        <p className="mt-8 text-sm text-muted">Connecting to Ollama…</p>
      )}
    </div>
  )
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="mt-8 w-full rounded-2xl border border-line bg-panel/60 p-5 text-left">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
        {icon}
        {title}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function CodeLine({ children }: { children: ReactNode }) {
  return (
    <code className="mt-2 block w-full rounded-lg border border-line bg-[var(--color-code-bg)] px-3 py-2 font-mono text-[13px] text-[#e6a99a]">
      {children}
    </code>
  )
}
