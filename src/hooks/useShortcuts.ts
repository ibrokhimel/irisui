import { useEffect } from 'react'
import { matchShortcut, SHORTCUT_ESCAPE, SHORTCUT_NEW_CHAT, SHORTCUT_PALETTE } from '../lib/shortcuts'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * App-wide keyboard shortcuts. A single window-level listener, gated so it
 * never fights an open dialog's own Escape handler (SettingsModal/
 * CommandPalette each own Escape while mounted — see `isDialogOpen`).
 */
export function useShortcuts({
  isDialogOpen,
  isStreaming,
  onTogglePalette,
  onNewChat,
  onStopGenerating,
}: {
  /** True while the command palette or any modal is open. */
  isDialogOpen: boolean
  isStreaming: boolean
  onTogglePalette: () => void
  onNewChat: () => void
  onStopGenerating: () => void
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K opens the palette from anywhere — even mid-typing.
      if (matchShortcut(e, SHORTCUT_PALETTE)) {
        e.preventDefault()
        onTogglePalette()
        return
      }

      // Escape stops generation or closes dialogs, reachable even while typing.
      if (matchShortcut(e, SHORTCUT_ESCAPE)) {
        // Any open dialog owns Escape (app-level state OR any rendered dialog,
        // covering page-local ConfirmDialogs).
        if (isDialogOpen || document.querySelector('[role="dialog"]')) return
        if (isStreaming) {
          e.preventDefault()
          onStopGenerating()
        }
        return
      }

      // Every other shortcut below is suppressed while the user is typing.
      if (isTypingTarget(e.target)) return

      if (matchShortcut(e, SHORTCUT_NEW_CHAT)) {
        e.preventDefault()
        onNewChat()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDialogOpen, isStreaming, onTogglePalette, onNewChat, onStopGenerating])
}
