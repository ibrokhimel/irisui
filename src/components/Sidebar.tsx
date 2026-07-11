import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  Activity,
  BookOpen,
  Boxes,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { ConversationMeta } from '../lib/store'
import { SPRING, SPRING_SOFT } from '../lib/motion'
import { IrisMark } from './IrisMark'

const DAY = 86_400_000
const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older']

function groupOf(ts: number): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startOfToday) return 'Today'
  if (ts >= startOfToday - DAY) return 'Yesterday'
  if (ts >= startOfToday - 7 * DAY) return 'Previous 7 days'
  return 'Older'
}

export function Sidebar({
  open,
  view,
  metas,
  currentId,
  search,
  onSearch,
  onNewChat,
  onOpenModels,
  onOpenKnowledge,
  onOpenStudio,
  onOpenStats,
  pullActive,
  pullPercent,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onExport,
  onOpenSettings,
}: {
  open: boolean
  view: 'chat' | 'models' | 'knowledge' | 'studio' | 'stats'
  metas: ConversationMeta[]
  currentId: string
  search: string
  onSearch: (query: string) => void
  onNewChat: () => void
  onOpenModels: () => void
  onOpenKnowledge: () => void
  onOpenStudio: () => void
  onOpenStats: () => void
  pullActive: boolean
  pullPercent: number | null
  onSelectChat: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onDeleteChat: (id: string) => void
  onExport: (id: string, format: 'md' | 'json') => void
  onOpenSettings: () => void
}) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false)

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const q = search.trim().toLowerCase()
  const filtered = q ? metas.filter((m) => m.title.toLowerCase().includes(q)) : metas
  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: filtered.filter((m) => groupOf(m.updatedAt) === label),
  })).filter((g) => g.items.length > 0)

  const startRename = (m: ConversationMeta) => {
    setMenuId(null)
    setDraft(m.title)
    setRenamingId(m.id)
  }
  const commitRename = () => {
    const id = renamingId
    setRenamingId(null)
    if (skipBlur.current) {
      skipBlur.current = false
      return
    }
    if (id) onRenameChat(id, draft)
  }

  return (
    <m.aside
      initial={false}
      animate={{ width: open ? 288 : 0 }}
      transition={SPRING_SOFT}
      className={
        'shrink-0 overflow-hidden bg-panel/70 backdrop-blur-sm ' +
        (open ? 'border-r border-line' : '')
      }
    >
      <m.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className="flex h-full w-72 flex-col"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4">
          <IrisMark className="h-7 w-7 text-fg" />
          <span className="font-brand text-[13px] tracking-[0.35em] text-fg">IRIS</span>
        </div>

        {/* New chat */}
        <div className="px-3">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel2/80 px-3 py-2.5 text-sm font-medium text-fg transition hover:border-iris/40 hover:bg-panel2"
          >
            <Plus className="h-4 w-4 text-iris" />
            New Chat
          </button>
        </div>

        {/* Models nav */}
        <div className="px-3 pt-2">
          <button
            onClick={onOpenModels}
            className={
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' +
              (view === 'models'
                ? 'bg-panel2 text-fg'
                : 'text-muted hover:bg-panel2/60 hover:text-fg')
            }
          >
            <Boxes className="h-4 w-4" />
            Models
            {pullActive && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-iris">
                <Loader2 className="h-3 w-3 animate-spin" />
                {pullPercent !== null ? `${pullPercent}%` : ''}
              </span>
            )}
          </button>
          <button
            onClick={onOpenKnowledge}
            className={
              'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' +
              (view === 'knowledge'
                ? 'bg-panel2 text-fg'
                : 'text-muted hover:bg-panel2/60 hover:text-fg')
            }
          >
            <BookOpen className="h-4 w-4" />
            Knowledge
          </button>
          <button
            onClick={onOpenStudio}
            className={
              'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' +
              (view === 'studio'
                ? 'bg-panel2 text-fg'
                : 'text-muted hover:bg-panel2/60 hover:text-fg')
            }
          >
            <Sparkles className="h-4 w-4" />
            Studio
          </button>
          <button
            onClick={onOpenStats}
            className={
              'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ' +
              (view === 'stats' ? 'bg-panel2 text-fg' : 'text-muted hover:bg-panel2/60 hover:text-fg')
            }
          >
            <Activity className="h-4 w-4" />
            Stats
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-2.5 py-2 focus-within:border-iris/40">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
            />
            {search && (
              <button onClick={() => onSearch('')} aria-label="Clear search" className="shrink-0">
                <X className="h-3.5 w-3.5 text-muted hover:text-fg" />
              </button>
            )}
          </div>
        </div>

        {/* History */}
        <div className="mt-2 flex-1 overflow-y-auto px-2 py-2">
          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted">
              {q ? 'No matching chats' : 'No chats yet. Start a new one.'}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted/70">
                  {group.label}
                </p>
                <AnimatePresence mode="popLayout" initial={false}>
                {group.items.map((c) => (
                  <m.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={SPRING}
                    className="group relative"
                  >
                    {renamingId === c.id ? (
                      <input
                        ref={renameRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            renameRef.current?.blur()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            skipBlur.current = true
                            renameRef.current?.blur()
                          }
                        }}
                        className="w-full rounded-lg border border-iris/60 bg-panel2 px-2.5 py-2 text-sm text-fg outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => onSelectChat(c.id)}
                        className={
                          'relative flex w-full items-center rounded-lg py-2 pl-2.5 pr-8 text-left text-sm transition-colors ' +
                          (c.id === currentId
                            ? 'text-fg'
                            : 'text-muted hover:bg-panel2/60 hover:text-fg')
                        }
                      >
                        {/* One highlight that glides between rows on selection. */}
                        {c.id === currentId && (
                          <m.span
                            layoutId="active-chat"
                            className="absolute inset-0 rounded-lg bg-panel2"
                            transition={SPRING}
                          />
                        )}
                        <span className="relative truncate">{c.title}</span>
                      </button>
                    )}

                    {renamingId !== c.id && (
                      <button
                        onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        aria-label="Chat options"
                        className={
                          'absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition hover:bg-panel hover:text-fg ' +
                          (menuId === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}

                    {menuId === c.id && (
                      <button
                        className="fixed inset-0 z-10 cursor-default"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={() => setMenuId(null)}
                      />
                    )}
                    <AnimatePresence>
                    {menuId === c.id && (
                        <m.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.97, y: -2 }}
                          transition={{ duration: 0.12, ease: 'easeOut' }}
                          className="absolute right-1 top-full z-20 mt-1 w-48 origin-top-right overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-xl"
                        >
                          <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => startRename(c)}>
                            Rename
                          </MenuItem>
                          <MenuItem
                            icon={<Download className="h-4 w-4" />}
                            onClick={() => {
                              setMenuId(null)
                              onExport(c.id, 'md')
                            }}
                          >
                            Export as Markdown
                          </MenuItem>
                          <MenuItem
                            icon={<Download className="h-4 w-4" />}
                            onClick={() => {
                              setMenuId(null)
                              onExport(c.id, 'json')
                            }}
                          >
                            Export as JSON
                          </MenuItem>
                          <MenuItem
                            icon={<Trash2 className="h-4 w-4" />}
                            danger
                            onClick={() => {
                              setMenuId(null)
                              onDeleteChat(c.id)
                            }}
                          >
                            Delete
                          </MenuItem>
                        </m.div>
                    )}
                    </AnimatePresence>
                  </m.div>
                ))}
                </AnimatePresence>
              </div>
            ))
          )}
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
      </m.div>
    </m.aside>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-panel2 ' +
        (danger ? 'text-rose-300' : 'text-fg')
      }
    >
      <span className={danger ? 'text-rose-400' : 'text-muted'}>{icon}</span>
      {children}
    </button>
  )
}
