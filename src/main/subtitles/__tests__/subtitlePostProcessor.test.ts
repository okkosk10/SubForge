import { describe, expect, it } from 'vitest'
import type { Segment } from '@shared/domain'
import { postProcessTranslatedSegments, postProcessTranslatedText } from '../subtitlePostProcessor'

function makeSegment(input: Partial<Segment> & Pick<Segment, 'sequence'>): Segment {
  return {
    id: `segment-${input.sequence}`,
    jobId: 'job-1',
    sequence: input.sequence,
    startMs: input.startMs ?? 0,
    endMs: input.endMs ?? 1000,
    sourceText: input.sourceText ?? '원문',
    translatedText: input.translatedText ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('subtitlePostProcessor', () => {
  it('normalizes whitespace and adds spacing after punctuation', () => {
    const processed = postProcessTranslatedText('  안녕하세요.오늘은   조금 일찍 일어났어요.  ')
    expect(processed).toBe('안녕하세요. 오늘은 조금 일찍 일어났어요.')
  })

  it('does not inject spaces inside decimal numbers', () => {
    const processed = postProcessTranslatedText('가격은 3.14입니다.오늘 공개해요!지금 확인하세요?좋아요')
    expect(processed).toBe('가격은 3.14입니다. 오늘 공개해요! 지금 확인하세요? 좋아요')
  })

  it('processes translated text only and keeps source/timestamps unchanged in repository contract', () => {
    const segments = [
      makeSegment({
        sequence: 0,
        startMs: 610,
        endMs: 3590,
        sourceText: 'こんにちは。今日は少し早く起きました。',
        translatedText: '안녕하세요.오늘은   조금 일찍 일어났어요.',
      }),
    ]

    const processed = postProcessTranslatedSegments(segments)
    expect(processed).toEqual([
      {
        sequence: 0,
        translatedText: '안녕하세요. 오늘은 조금 일찍 일어났어요.',
      },
    ])
    expect(segments[0]?.sourceText).toBe('こんにちは。今日は少し早く起きました。')
    expect(segments[0]?.startMs).toBe(610)
    expect(segments[0]?.endMs).toBe(3590)
    expect(segments[0]?.sequence).toBe(0)
  })
})
