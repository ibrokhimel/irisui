import { describe, expect, it } from 'vitest'
import { shouldFallbackToLocal, speechErrorKind } from '../../src/lib/speech'

describe('speechErrorKind', () => {
  it('classifies the two codes that mean the remote speech service is unreachable', () => {
    expect(speechErrorKind('network')).toBe('service')
    expect(speechErrorKind('service-not-allowed')).toBe('service')
  })

  it('classifies a denied microphone as a permission problem', () => {
    expect(speechErrorKind('not-allowed')).toBe('permission')
  })

  it('classifies a missing microphone as a device problem', () => {
    expect(speechErrorKind('audio-capture')).toBe('device')
  })

  it('classifies silence and user-initiated abort as benign', () => {
    expect(speechErrorKind('no-speech')).toBe('benign')
    expect(speechErrorKind('aborted')).toBe('benign')
  })

  it('classifies anything else as unknown', () => {
    expect(speechErrorKind('weird-thing')).toBe('unknown')
  })
})

describe('shouldFallbackToLocal', () => {
  it('falls back only when an auto session hits a service-kind error', () => {
    expect(shouldFallbackToLocal('auto', 'service')).toBe(true)
  })

  it('does not fall back for a session pinned to web, even on a service error', () => {
    // The user explicitly chose browser-only — a dead remote service should
    // surface as an error, not silently swap engines underneath them.
    expect(shouldFallbackToLocal('web', 'service')).toBe(false)
  })

  it('does not fall back for a session pinned to local', () => {
    expect(shouldFallbackToLocal('local', 'service')).toBe(false)
  })

  it('does not fall back for auto sessions on non-service error kinds', () => {
    expect(shouldFallbackToLocal('auto', 'permission')).toBe(false)
    expect(shouldFallbackToLocal('auto', 'device')).toBe(false)
    expect(shouldFallbackToLocal('auto', 'benign')).toBe(false)
    expect(shouldFallbackToLocal('auto', 'unknown')).toBe(false)
  })
})
