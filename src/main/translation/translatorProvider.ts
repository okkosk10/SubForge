import type { SourceLanguage } from '@shared/domain'

export interface TranslationSegmentInput {
  sequence: number
  sourceText: string
}

export interface TranslationSegmentResult {
  sequence: number
  translatedText: string
}

export interface TranslationRunMetadata {
  provider?: string
  fallbackUsed?: boolean
  fallbackReason?: string
  timing?: {
    modelLoadMs?: number
    inferenceMs?: number
    totalMs: number
  }
}

export interface TranslatorProvider {
  translateSegments(input: {
    sourceLanguage: SourceLanguage
    targetLanguage: 'ko'
    segments: TranslationSegmentInput[]
  }): Promise<TranslationSegmentResult[]>
  getLastTranslationMetadata?(): TranslationRunMetadata | null
}
