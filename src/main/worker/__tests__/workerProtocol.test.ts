import { describe, expect, it } from 'vitest'
import { parseWorkerResponseLine } from '../workerProtocol'

describe('worker protocol parser', () => {
  it('parses successful probe response', () => {
    const line = JSON.stringify({
      requestId: 'req-1',
      ok: true,
      type: 'PROBE_RESULT',
      payload: {
        durationMs: 24123,
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        sizeBytes: 123,
        bitRate: 456,
        video: {
          codec: 'h264',
          width: 1920,
          height: 1080,
          fps: 30,
        },
        audio: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
        },
      },
    })

    const parsed = parseWorkerResponseLine(line)
    expect(parsed.ok).toBe(true)
    expect(parsed.requestId).toBe('req-1')
  })

  it('parses error response', () => {
    const line = JSON.stringify({
      requestId: 'req-2',
      ok: false,
      type: 'ERROR',
      error: {
        code: 'FFPROBE_FAILED',
        message: 'Failed to probe media file.',
      },
    })

    const parsed = parseWorkerResponseLine(line)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('FFPROBE_FAILED')
    }
  })

  it('throws on malformed json', () => {
    expect(() => parseWorkerResponseLine('{bad json')).toThrow('Worker returned malformed JSON response.')
  })

  it('throws when requestId is missing', () => {
    const line = JSON.stringify({ ok: true, type: 'PROBE_RESULT', payload: {} })
    expect(() => parseWorkerResponseLine(line)).toThrow('Worker response requestId is missing.')
  })
})
