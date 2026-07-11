import { describe, expect, it } from 'vitest'
import { speechErrorMessage, transcriptFrom } from '../../src/lib/speech'

/**
 * Chrome/Edge deliver `results` CUMULATIVELY across a listening session and
 * advance `resultIndex` past results that are already final. These fixtures
 * reproduce that exact shape.
 */
const results = (...items: { t: string; final: boolean }[]) => {
  const list: Record<number, unknown> & { length: number } = { length: items.length }
  items.forEach((item, i) => {
    list[i] = { 0: { transcript: item.t }, isFinal: item.final }
  })
  return list as never
}

describe('transcriptFrom', () => {
  it('returns the in-progress utterance', () => {
    expect(transcriptFrom(results({ t: 'hello', final: false }))).toEqual({
      text: 'hello',
      isFinal: false,
    })
  })

  it('marks a finalized utterance as final', () => {
    expect(transcriptFrom(results({ t: 'hello world', final: true }))).toEqual({
      text: 'hello world',
      isFinal: true,
    })
  })

  it('keeps EVERY earlier utterance once a new one starts (the regression)', () => {
    // The bug: reading only from resultIndex returned just 'how are you',
    // so the composer overwrote 'hello world' and the user lost their speech.
    expect(
      transcriptFrom(
        results({ t: 'hello world', final: true }, { t: ' how are you', final: false }),
      ).text,
    ).toBe('hello world how are you')
  })

  it('folds the whole session into one clean transcript', () => {
    expect(
      transcriptFrom(
        results(
          { t: 'hello world', final: true },
          { t: ' how are you today', final: true },
          { t: '  friend', final: true },
        ),
      ),
    ).toEqual({ text: 'hello world how are you today friend', isFinal: true })
  })

  it('separates utterances even when the engine omits leading spaces', () => {
    // Chrome usually prefixes follow-up results with a space; not all do.
    expect(
      transcriptFrom(results({ t: 'hello world', final: true }, { t: 'how are you', final: false }))
        .text,
    ).toBe('hello world how are you')
  })

  it('normalizes stray whitespace and handles an empty list', () => {
    expect(transcriptFrom(results({ t: '  spaced   out  ', final: true })).text).toBe('spaced out')
    expect(transcriptFrom(results())).toEqual({ text: '', isFinal: false })
  })
})

describe('speechErrorMessage', () => {
  it('explains a denied microphone', () => {
    expect(speechErrorMessage('not-allowed')).toMatch(/microphone/i)
    expect(speechErrorMessage('service-not-allowed')).toMatch(/microphone/i)
  })

  it('explains a missing mic and an unreachable service', () => {
    expect(speechErrorMessage('audio-capture')).toMatch(/no microphone/i)
    expect(speechErrorMessage('network')).toMatch(/connection|service/i)
  })

  it('stays silent for benign silence', () => {
    expect(speechErrorMessage('no-speech')).toBe('')
    expect(speechErrorMessage('aborted')).toBe('')
  })

  it('falls back to a generic message', () => {
    expect(speechErrorMessage('weird-thing')).toBeTruthy()
  })
})
