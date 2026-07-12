/**
 * Read a Server-Sent Events stream and hand each event's `data:` payload to
 * onEvent. Used by both cloud adapters.
 *
 * Deliberately forgiving in the same way lib/ollama.ts's NDJSON reader is: a
 * comment, a blank line, an unknown field, or the [DONE] sentinel is skipped
 * rather than treated as a failure. A partial event at a chunk boundary is
 * buffered until the rest arrives.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trimEnd()
        buffer = buffer.slice(nl + 1)
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        onEvent(data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
