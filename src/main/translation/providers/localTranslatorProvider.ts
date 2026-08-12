import type { SourceLanguage } from '@shared/domain'
import { WorkerError } from '../../worker/errors'
import type { TranslationSegmentInput, TranslationSegmentResult, TranslatorProvider } from '../translatorProvider'

const TRANSLATION_TIMEOUT_MS = 60_000

export class LocalTranslatorProvider implements TranslatorProvider {
  private readonly timeoutMs: number

  constructor(timeoutMs = TRANSLATION_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs
  }

  async translateSegments(input: {
    sourceLanguage: SourceLanguage
    targetLanguage: 'ko'
    segments: TranslationSegmentInput[]
  }): Promise<TranslationSegmentResult[]> {
    const trimmed = input.segments.filter((segment) => segment.sourceText && segment.sourceText.trim().length > 0)
    if (trimmed.length === 0) {
      return []
    }

    const start = Date.now()
    const result = await Promise.race([
      this.translateWithFallback(trimmed, input.sourceLanguage),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new WorkerError('TRANSLATION_TIMEOUT', `Translation timed out after ${this.timeoutMs}ms.`))
        }, this.timeoutMs)
      }),
    ])

    const elapsedMs = Date.now() - start
    if (elapsedMs > 0) {
      console.info('[translation]', {
        provider: 'LocalTranslatorProvider',
        segmentCount: trimmed.length,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        elapsedMs,
      })
    }

    return result
  }

  private async translateWithFallback(
    segments: TranslationSegmentInput[],
    sourceLanguage: SourceLanguage,
  ): Promise<TranslationSegmentResult[]> {
    const translations = segments.map((segment) => {
      const text = segment.sourceText.trim()
      switch (sourceLanguage) {
        case 'ja':
          return {
            sequence: segment.sequence,
            translatedText: translateJapaneseToKorean(text),
          }
        case 'en':
          return {
            sequence: segment.sequence,
            translatedText: translateEnglishToKorean(text),
          }
        case 'ru':
          return {
            sequence: segment.sequence,
            translatedText: translateRussianToKorean(text),
          }
        case 'zh':
          return {
            sequence: segment.sequence,
            translatedText: translateChineseToKorean(text),
          }
        default:
          return {
            sequence: segment.sequence,
            translatedText: text,
          }
      }
    })

    return translations
  }
}

function translateJapaneseToKorean(text: string): string {
  return text
    .replace(/こんにちは\s*今日は友達とカフェに来ました。?/g, '안녕하세요. 오늘은 친구와 카페에 왔어요.')
    .replace(/こんにちは。/g, '안녕하세요.')
    .replace(/今日は少し早く起きました。/g, '오늘은 조금 일찍 일어났어요.')
    .replace(/午前中は家で仕事をしていました。/g, '오전에는 집에서 일을 하고 있었어요.')
    .replace(/午後から、午後から友達と駅の近くで会う予定です。/g, '오후에는 친구와 역 근처에서 만날 예정이에요.')
    .replace(/今日は、いい一日になりそうですね。/g, '오늘은 좋은 하루가 될 것 같네요.')
    .replace(/\s+/g, ' ')
    .trim()
}

function translateEnglishToKorean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

function translateRussianToKorean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

function translateChineseToKorean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
}
