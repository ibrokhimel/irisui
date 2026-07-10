import { Menu, Settings, Trash2 } from 'lucide-react'

export function TopBar({
  onToggleSidebar,
  hasMessages,
  onClear,
  onOpenSettings,
}: {
  onToggleSidebar: () => void
  hasMessages: boolean
  onClear: () => void
  onOpenSettings: () => void
}) {
  return (
    <header className="flex items-center justify-between px-3 py-2.5">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1">
        {hasMessages && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-panel hover:text-fg"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Clear chat</span>
          </button>
        )}
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
