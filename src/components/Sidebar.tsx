import { Aperture, Plus, MessageSquare, Settings } from 'lucide-react'

export function Sidebar({ onNewChat }: { onNewChat: () => void }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel/70 backdrop-blur-sm md:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel2">
          <Aperture className="h-[18px] w-[18px] text-iris" />
        </div>
        <span className="bg-gradient-to-r from-[#e0959d] via-[#c25767] to-[#8f2f3d] bg-clip-text text-[17px] font-semibold tracking-tight text-transparent">
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

      {/* Footer / settings placeholder */}
      <div className="border-t border-line px-3 py-3">
        <button
          disabled
          className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted/80"
        >
          <Settings className="h-4 w-4" />
          Settings
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted/50">soon</span>
        </button>
      </div>
    </aside>
  )
}
