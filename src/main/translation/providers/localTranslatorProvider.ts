import type { SourceLanguage, TargetLanguage } from '@shared/domain'
import { WorkerError } from '../../worker/errors'
import { PythonWorkerClient } from '../../worker/pythonWorkerClient'
import type { TranslationSegmentInput, TranslationSegmentResult, TranslatorProvider } from '../translatorProvider'

interface TranslationWorkerAdapter {
  translateSegments(input: {
    sourceLanguage: SourceLanguage
    targetLanguage: TargetLanguage
    segments: Array<{ sequence: number; text: string }>
  }): Promise<{ segments: Array<{ sequence: number; translatedText: string }> }>
}

export class LocalTranslatorProvider implements TranslatorProvider {
  constructor(private readonly workerClient: TranslationWorkerAdapter = new PythonWorkerClient()) {}

  async translateSegments(input: {
    sourceLanguage: SourceLanguage
    targetLanguage: 'ko'
    segments: TranslationSegmentInput[]
  }): Promise<TranslationSegmentResult[]> {
    const trimmed = input.segments.filter((segment) => segment.sourceText && segment.sourceText.trim().length > 0)
    if (trimmed.length === 0) {
      return []
    }

    try {
      const response = await this.workerClient.translateSegments({
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        segments: trimmed.map((segment) => ({
          sequence: segment.sequence,
          text: segment.sourceText,
        })),
      })

      if (!Array.isArray(response.segments)) {
        throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translation response segments are missing.')
      }

      return response.segments.map((segment) => ({
        sequence: Number(segment.sequence),
        translatedText: String(segment.translatedText ?? '').trim(),
      }))
    } catch (error) {
      if (error instanceof WorkerError) {
        if (error.code === 'WORKER_TIMEOUT') {
          throw new WorkerError('TRANSLATION_TIMEOUT', 'Translation worker timed out.')
        }
        throw error
      }
      if (error instanceof Error) {
        throw new WorkerError('TRANSLATION_FAILED', error.message)
      }
      throw new WorkerError('TRANSLATION_FAILED', 'Local translation failed unexpectedly.')
    }
  }
}
