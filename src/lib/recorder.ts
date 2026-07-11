/**
 * Mic capture for on-device transcription. Whisper needs mono 16 kHz
 * Float32 samples, so the recorded blob is decoded and resampled right here —
 * callers (useSpeechInput) just get a Float32Array ready to hand to the
 * worker.
 */

export interface Recorder {
  /** Stops capture, releases the mic, and resolves with mono 16 kHz audio. */
  stop(): Promise<Float32Array>
  /** Stops capture and releases the mic without producing audio (user aborted). */
  cancel(): void
}

const WHISPER_SAMPLE_RATE = 16000

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  for (const candidate of ['audio/webm', 'audio/ogg', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return undefined
}

/**
 * OfflineAudioContext does the resampling (browsers ship a high-quality
 * resampler) — a hand-rolled linear interpolation would be lower quality and
 * more code for no benefit. Requesting a 1-channel destination also performs
 * the stereo→mono downmix per the Web Audio spec's standard channel rules.
 */
async function decodeToMonoFloat32(blob: Blob, targetRate: number): Promise<Float32Array> {
  // Tapping the mic on and straight back off records nothing, and
  // decodeAudioData rejects with an opaque EncodingError on a zero-byte
  // buffer. Silence isn't an error — hand back empty audio and let the caller
  // treat it as "nothing was said" rather than surfacing a browser exception.
  if (blob.size === 0) return new Float32Array(0)

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const probe = new AudioCtx()
  let decoded: AudioBuffer
  try {
    decoded = await probe.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void probe.close()
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate))
  const offline = new OfflineAudioContext(1, frames, targetRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  let settled = false
  const releaseMic = () => {
    for (const track of stream.getTracks()) track.stop()
  }

  const blobPromise = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mediaRecorder.mimeType }))
  })

  mediaRecorder.start()

  return {
    async stop() {
      if (settled) throw new Error('Recorder already stopped.')
      settled = true
      try {
        // stop() throws InvalidStateError if the recorder already went
        // inactive on its own (mic unplugged, permission revoked mid-session).
        // Releasing the mic must happen regardless, or the browser's recording
        // indicator stays lit for the rest of the session — cancel() already
        // guards this; stop() must too.
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        const blob = await blobPromise
        return await decodeToMonoFloat32(blob, WHISPER_SAMPLE_RATE)
      } finally {
        releaseMic()
      }
    },
    cancel() {
      if (settled) return
      settled = true
      // Detach onstop first: a manual stop() below still fires the event, and
      // nothing should resolve blobPromise for audio nobody asked for.
      mediaRecorder.onstop = null
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      releaseMic()
    },
  }
}
