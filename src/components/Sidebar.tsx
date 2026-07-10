import { MessageSquare, Plus, Settings } from 'lucide-react'
import { Spark } from './Spark'

export function Sidebar({
  open,
  onNewChat,
  onOpenSettings,
}: {
  open: boolean
  onNewChat: () => void
  onOpenSettings: () => void
}) {
  return (
    <aside
      className={
        'shrink-0 overflow-hidden bg-panel/70 backdrop-blur-sm transition-[width] duration-200 ease-out ' +
        (open ? 'w-64 border-r border-line' : 'w-0')
      }
    >
      <div className="flex h-full w-64 flex-col">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Spark className="h-5 w-5 text-iris" />
          <span className="bg-gradient-to-r from-[var(--color-iris)] to-[var(--color-iris-strong)] bg-clip-text text-[17px] font-semibold tracking-tight text-transparent">
            IrisUI
          </span>
        </div>

        <div className="px-3">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel2/80 px-3 py-2.5 text-sm font-medium text-fg transition hover:border-iris/40 hover:bg-panel2"
          >
            <Plus className="h-4 w-4 text-iris" />
            New Chat
          </button>
        </div>

        {/* History placeholder */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">
            History
          </p>
          <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted">
            <MessageSquare className="h-4 w-4 opacity-60" />
            Chat history coming soon
          </div>
        </div>

        {/* Footer / settings */}
        <div className="border-t border-line px-3 py-3">
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel2 hover:text-fg"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>
    </aside>
  )
}
