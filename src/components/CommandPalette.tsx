import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Search } from 'lucide-react'
import { SPRING } from '../lib/motion'

export interface PaletteCommand {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  run: () => void
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean
  commands: PaletteCommand[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [query, commands])

  // Reset to a clean slate every time the palette opens, and autofocus the search field.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // Window-level Escape (mirrors SettingsModal) so it closes even if focus
  // ever leaves the search input, not just via the input's own key handler.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Keep the highlighted row in range as the filter narrows.
  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)))
  }, [filtered.length])

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const run = (cmd: PaletteCommand) => {
    onClose()
    cmd.run()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[activeIndex]
      if (cmd) run(cmd)
    }
    // Escape is handled by the window-level listener below.
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="command-palette"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close command palette"
            onClick={onClose}
          />

          <m.div
            className="relative h-fit w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={SPRING}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type a command…"
                aria-label="Search commands"
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/60"
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">No matching commands</p>
              ) : (
                filtered.map((cmd, i) => {
                  const Icon = cmd.icon
                  const active = i === activeIndex
                  return (
                    <button
                      key={cmd.id}
                      ref={(el) => {
                        itemRefs.current[i] = el
                      }}
                      onClick={() => run(cmd)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ' +
                        (active ? 'bg-panel2 text-fg' : 'text-muted hover:bg-panel2/60 hover:text-fg')
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{cmd.label}</span>
                    </button>
                  )
                })
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
