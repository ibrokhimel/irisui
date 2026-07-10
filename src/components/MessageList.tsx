import { useEffect, useRef } from 'react'
import type { ChatMessage, OllamaStatus } from '../types'
import { Message } from './Message'
import { EmptyState } from './EmptyState'

export function MessageList({
  messages,
  status,
  isStreaming,
  onPickPrompt,
}: {
  messages: ChatMessage[]
  status: OllamaStatus
  isStreaming: boolean
  onPickPrompt: (prompt: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState status={status} onPickPrompt={onPickPrompt} />
      </div>
    )
  }

  const lastId = messages[messages.length - 1]?.id

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            streaming={isStreaming && m.role === 'assistant' && m.id === lastId}
          />
        ))}
        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}
