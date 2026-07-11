import { describe, expect, it } from 'vitest'
import { resolveTtsVoice } from '../../src/lib/tts'

function fakeVoice(voiceURI: string, name: string, lang: string): SpeechSynthesisVoice {
  return { voiceURI, name, lang, default: false, localService: true } as SpeechSynthesisVoice
}

describe('resolveTtsVoice', () => {
  const voices = [
    fakeVoice('urn:a', 'Alex', 'en-US'),
    fakeVoice('urn:b', 'Brigitte', 'fr-FR'),
  ]

  it('resolves the voice matching the saved voiceURI', () => {
    expect(resolveTtsVoice('urn:b', voices)?.name).toBe('Brigitte')
  })

  it('falls back to the system default (undefined) when voiceURI is empty', () => {
    expect(resolveTtsVoice('', voices)).toBeUndefined()
  })

  it('falls back to the system default when the saved voiceURI no longer matches an installed voice', () => {
    // e.g. a voice pack was uninstalled, or the setting synced from another machine.
    expect(resolveTtsVoice('urn:gone', voices)).toBeUndefined()
  })

  it('falls back to the system default when there are no voices at all', () => {
    expect(resolveTtsVoice('urn:a', [])).toBeUndefined()
  })
})
