import type { ChatMessage, Effort } from '../types'
import type { NumCtxSetting } from './appSettings'
import { createIdbStore } from './idbStore'

/**
 * Storage-agnostic chat persistence. The app depends only on this interface;
 * today it's backed by IndexedDB (idbStore). When IrisUI grows a Tauri desktop
 * shell, a `sqliteStore` implementing the same interface can drop in here —
 * no UI or hook changes required.
 */

export interface ConversationMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  model: string
  effort: Effort
  temperature: number
  /** num_ctx setting for this chat — a pinned number, or 'auto' to derive it
   *  from the model. Optional so conversations persisted before context-window
   *  tracking shipped load without migration (they fall back to the default). */
  numCtx?: NumCtxSetting
  /** Attached knowledge base for RAG-grounded replies. Optional so
   *  conversations persisted before v0.8 load without migration. */
  kbId?: string
  /** Persona whose system prompt drives this chat. Optional so
   *  conversations persisted before v0.9 load without migration. */
  personaId?: string
}

export interface Conversation extends ConversationMeta {
  messages: ChatMessage[]
}

export interface ChatStore {
  /** Lightweight list for the sidebar (no message bodies), newest first. */
  listMeta(): Promise<ConversationMeta[]>
  /** Full conversation including messages. */
  get(id: string): Promise<Conversation | null>
  /** Insert or update a conversation. */
  put(conv: Conversation): Promise<void>
  /** Delete a conversation and its messages. */
  remove(id: string): Promise<void>
}

let instance: ChatStore | null = null

/** The active store. Swap this line for a SQLite store in the desktop build. */
export function getStore(): ChatStore {
  return (instance ??= createIdbStore())
}
