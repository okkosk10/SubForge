import type { SourceLanguage } from '@shared/domain'
import type { TranslationSegmentInput, TranslationSegmentResult, TranslatorProvider } from './translatorProvider'

export class TranslationService {
  constructor(private readonly provider: TranslatorProvider) {}

  async translate(_jobId: string, sourceLanguage: SourceLanguage, segments: TranslationSegmentInput[]): Promise<TranslationSegmentResult[]> {
    return this.provider.translateSegments({
      sourceLanguage,
      targetLanguage: 'ko',
      segments,
    })
  }
}
