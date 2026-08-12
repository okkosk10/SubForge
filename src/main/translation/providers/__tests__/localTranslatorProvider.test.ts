import { describe, expect, it } from 'vitest'
import { WorkerError } from '../../../worker/errors'
import { LocalTranslatorProvider } from '../localTranslatorProvider'

describe('LocalTranslatorProvider', () => {
  it('delegates translation to worker adapter and preserves sequence', async () => {
    const provider = new LocalTranslatorProvider({
      translateSegments: async () => ({
        segments: [
          { sequence: 2, translatedText: '두 번째' },
          { sequence: 1, translatedText: '첫 번째' },
        ],
        provider: 'aihub-ja-ko',
        fallbackUsed: false,
        timing: {
          modelLoadMs: 1200,
          inferenceMs: 80,
          totalMs: 1280,
        },
      }),
    })

    const result = await provider.translateSegments({
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
      segments: [
        { sequence: 2, sourceText: '駅で友達を待っています。' },
        { sequence: 1, sourceText: '明日は雨が降るかもしれません。' },
      ],
    })

    expect(result).toEqual([
      { sequence: 2, translatedText: '두 번째' },
      { sequence: 1, translatedText: '첫 번째' },
    ])
    expect(provider.getLastTranslationMetadata()).toEqual({
      provider: 'aihub-ja-ko',
      fallbackUsed: false,
      fallbackReason: undefined,
      timing: {
        modelLoadMs: 1200,
        inferenceMs: 80,
        totalMs: 1280,
      },
    })
  })

  it('maps worker timeout to TRANSLATION_TIMEOUT', async () => {
    const provider = new LocalTranslatorProvider({
      translateSegments: async () => {
        throw new WorkerError('WORKER_TIMEOUT', 'timed out')
      },
    })

    await expect(
      provider.translateSegments({
        sourceLanguage: 'ja',
        targetLanguage: 'ko',
        segments: [{ sequence: 0, sourceText: 'この店のコーヒーはとてもおいしいです。' }],
      }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_TIMEOUT' })
  })
})
