import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import type { ChatMessage } from '../types'
import { Message } from './Message'

export function MessageList({
  messages,
  isStreaming,
  onRegenerate,
  onContinue,
}: {
  messages: ChatMessage[]
  isStreaming: boolean
  onRegenerate: () => void
  onContinue: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' })
  }, [messages, isStreaming, reduced])

  const lastId = messages[messages.length - 1]?.id

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        {messages.map((m) => {
          const isLast = m.id === lastId
          return (
            <Message
              key={m.id}
              message={m}
              streaming={isStreaming && m.role === 'assistant' && isLast}
              isLast={isLast}
              onRegenerate={!isStreaming ? onRegenerate : undefined}
              onContinue={!isStreaming ? onContinue : undefined}
            />
          )
        })}
        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}
