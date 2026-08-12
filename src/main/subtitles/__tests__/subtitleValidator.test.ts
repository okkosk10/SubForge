import { describe, expect, it } from 'vitest'
import type { Segment } from '@shared/domain'
import { validateSegmentsForSrt } from '../subtitleValidator'

function makeSegment(input: {
  sequence: number
  startMs: number
  endMs: number
  translatedText: string | null
}): Segment {
  return {
    id: `segment-${input.sequence}`,
    jobId: 'job-1',
    sequence: input.sequence,
    startMs: input.startMs,
    endMs: input.endMs,
    sourceText: 'source',
    translatedText: input.translatedText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('subtitleValidator', () => {
  it('returns ok for valid canonical segments', () => {
    const result = validateSegmentsForSrt([
      makeSegment({ sequence: 0, startMs: 610, endMs: 3590, translatedText: '안녕하세요.' }),
      makeSegment({ sequence: 1, startMs: 8410, endMs: 10430, translatedText: '오전에는 집에서 일을 하고 있었어요.' }),
    ])

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('fails when translated text is missing', () => {
    const result = validateSegmentsForSrt([
      makeSegment({ sequence: 0, startMs: 0, endMs: 1000, translatedText: null }),
    ])

    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'MISSING_TRANSLATION')).toBe(true)
  })

  it('fails when timestamp range is invalid', () => {
    const result = validateSegmentsForSrt([
      makeSegment({ sequence: 0, startMs: 2000, endMs: 1000, translatedText: '역전된 시간' }),
    ])

    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'INVALID_TIMESTAMP')).toBe(true)
  })
})
