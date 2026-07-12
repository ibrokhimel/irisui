import { describe, expect, it } from 'vitest'
import { readSseStream } from '../../../src/lib/providers/sse'

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
      c.close()
    },
  })
}

describe('readSseStream', () => {
  it('yields the data payload of each event', async () => {
    const got: string[] = []
    await readSseStream(stream(['data: {"a":1}\n\n', 'data: {"a":2}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('reassembles an event split across chunk boundaries', async () => {
    const got: string[] = []
    await readSseStream(stream(['data: {"a"', ':1}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}'])
  })

  it('skips the [DONE] sentinel and comment/blank lines', async () => {
    const got: string[] = []
    await readSseStream(stream([': ping\n\n', 'data: {"a":1}\n\n', 'data: [DONE]\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"a":1}'])
  })

  it('ignores non-data fields such as event:', async () => {
    const got: string[] = []
    await readSseStream(stream(['event: message_start\ndata: {"t":"x"}\n\n']), (d) => got.push(d))
    expect(got).toEqual(['{"t":"x"}'])
  })
})
