import { Aperture } from 'lucide-react'
import type { ChatMessage } from '../types'
import { Markdown } from './Markdown'

export function Message({
  message,
  streaming,
}: {
  message: ChatMessage
  streaming: boolean
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-line bg-panel2 px-4 py-2.5 text-[15px] leading-relaxed text-fg">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div
        className={
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-panel2 ' +
          (streaming ? 'border-iris/60 shadow-[0_0_0_3px_rgba(178,61,77,0.14)]' : 'border-line')
        }
      >
        <Aperture className="h-[18px] w-[18px] text-iris" />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        {message.content && <Markdown content={message.content} />}
        {streaming && <span className="stream-caret align-middle" aria-hidden="true" />}
      </div>
    </div>
  )
}
