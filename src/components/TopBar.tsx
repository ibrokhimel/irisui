import { Menu, Settings } from 'lucide-react'

export function TopBar({
  onToggleSidebar,
  onOpenSettings,
  title,
  showTitle,
}: {
  onToggleSidebar: () => void
  onOpenSettings: () => void
  title: string
  showTitle: boolean
}) {
  return (
    <header className="relative flex items-center justify-between px-3 py-2.5">
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {showTitle && (
        <div className="pointer-events-none absolute inset-x-0 mx-auto max-w-[50%] truncate text-center text-sm font-medium text-fg/90">
          {title}
        </div>
      )}

      <button
        onClick={onOpenSettings}
        aria-label="Settings"
        className="rounded-lg p-2 text-muted transition hover:bg-panel hover:text-fg"
      >
        <Settings className="h-5 w-5" />
      </button>
    </header>
  )
}
