import type { ReactNode } from 'react'
import { Code2, FileText, GraduationCap, Pencil, Sparkles, Terminal, WifiOff } from 'lucide-react'
import type { OllamaStatus } from '../types'
import { Spark } from './Spark'

const CHIPS = [
  { label: 'Write', icon: Pencil, prompt: 'Help me write ' },
  { label: 'Create', icon: Sparkles, prompt: 'Brainstorm ideas for ' },
  { label: 'Learn', icon: GraduationCap, prompt: 'Explain ' },
  { label: 'Code', icon: Code2, prompt: 'Write code that ' },
  { label: 'Summarize', icon: FileText, prompt: 'Summarize the following:\n\n' },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomeScreen({
  status,
  onPickPrompt,
  composer,
}: {
  status: OllamaStatus
  onPickPrompt: (prompt: string) => void
  composer: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16">
      <div className="mb-8 flex items-center justify-center gap-3.5">
        <Spark className="h-8 w-8 text-iris" />
        <h1 className="font-serif text-[34px] font-normal tracking-tight text-fg">{greeting()}</h1>
      </div>

      <div className="w-full max-w-2xl">{composer}</div>

      {status === 'online' && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {CHIPS.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              onClick={() => onPickPrompt(prompt)}
              className="flex items-center gap-2 rounded-xl border border-line bg-panel/40 px-3.5 py-2 text-sm text-muted transition hover:border-iris/40 hover:text-fg"
            >
              <Icon className="h-4 w-4" />
              {label}
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
          <p className="mt-2 text-muted">For a one-command dev start (Ollama + IrisUI together):</p>
          <CodeLine>npm run dev:ollama</CodeLine>
        </Notice>
      )}

      {status === 'checking' && <p className="mt-5 text-sm text-muted">Connecting to Ollama…</p>}
    </div>
  )
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mt-6 w-full max-w-md rounded-2xl border border-line bg-panel/50 p-5 text-left">
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
