import type { SourceLanguage } from '@shared/domain'

export interface TranslationSegmentInput {
  sequence: number
  sourceText: string
}

export interface TranslationSegmentResult {
  sequence: number
  translatedText: string
}

export interface TranslatorProvider {
  translateSegments(input: {
    sourceLanguage: SourceLanguage
    targetLanguage: 'ko'
    segments: TranslationSegmentInput[]
  }): Promise<TranslationSegmentResult[]>
}
