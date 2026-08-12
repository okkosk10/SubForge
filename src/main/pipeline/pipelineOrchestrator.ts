import type { PipelineStep, Segment, SourceLanguage, TranscriptionSegment } from '@shared/domain'
import type { JobRepository } from '../jobs/jobRepository'
import type { SegmentRepository } from '../segments/segmentRepository'
import type { TranslatorProvider } from '../translation/translatorProvider'
import { LocalTranslatorProvider } from '../translation/providers/localTranslatorProvider'
import type { WorkerClient } from '../worker/pythonWorkerClient'
import { WorkerError } from '../worker/errors'

export class PipelineOrchestrator {
  constructor(
    private readonly repository: JobRepository,
    private readonly workerClient: WorkerClient,
    private readonly segmentRepository?: SegmentRepository,
    private readonly translatorProvider: TranslatorProvider = new LocalTranslatorProvider(),
  ) {}

  async run(jobId: string, sourcePath: string, sourceLanguage: SourceLanguage): Promise<void> {
    await this.runProbe(jobId, sourcePath)
    await this.runTranscription(jobId, sourcePath, sourceLanguage)
    await this.runTranslation(jobId, sourceLanguage)
  }

  async runProbe(jobId: string, sourcePath: string): Promise<void> {
    const step: PipelineStep = 'PROBING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Job processing started.',
    })
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Media probing started.',
    })

    try {
      await this.workerClient.probe(sourcePath)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: 'Media probing completed.',
      })
    } catch (error) {
      const workerError = normalizeWorkerError(error)
      this.repository.markFailed(jobId, workerError.code, workerError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Media probing failed: ${workerError.message}`,
      })
      throw workerError
    }
  }

  async runTranscription(jobId: string, sourcePath: string, sourceLanguage: SourceLanguage): Promise<void> {
    const step: PipelineStep = 'TRANSCRIBING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Transcription started.',
    })

    try {
      const result = await this.workerClient.transcribe(sourcePath, sourceLanguage)
      const segments: TranscriptionSegment[] = result.segments.map((segment) => ({
        sequence: Number(segment.sequence),
        startMs: Number(segment.startMs),
        endMs: Number(segment.endMs),
        text: String(segment.text),
      }))

      if (this.segmentRepository) {
        this.segmentRepository.replaceForJob(
          jobId,
          segments.map((segment) => ({
            sequence: segment.sequence,
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.text,
          })),
        )
      }

      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: `Transcription completed. ${segments.length} segments saved.`,
      })
      this.repository.updateProgress(jobId, 60, step)
    } catch (error) {
      const workerError = normalizeWorkerError(error)
      this.repository.markFailed(jobId, workerError.code, workerError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Transcription failed: ${workerError.message}`,
      })
      throw workerError
    }
  }

  async runTranslation(jobId: string, sourceLanguage: SourceLanguage): Promise<void> {
    const step: PipelineStep = 'TRANSLATING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Translation started.',
    })

    try {
      if (!this.segmentRepository) {
        this.repository.updateProgress(jobId, 70, step)
        this.repository.addEvent({
          jobId,
          step,
          level: 'INFO',
          message: 'Translation skipped because no segment repository is configured.',
        })
        return
      }

      const segments: Segment[] = this.segmentRepository.listByJobId(jobId)
      const translatableSegments = segments.filter(
        (segment) => segment.sourceText && segment.sourceText.trim().length > 0,
      )

      const translations = await this.translatorProvider.translateSegments({
        sourceLanguage,
        targetLanguage: 'ko',
        segments: translatableSegments.map((segment) => ({
          sequence: segment.sequence,
          sourceText: segment.sourceText ?? '',
        })),
      })

      validateTranslationResult(translatableSegments, translations)
      this.segmentRepository.updateTranslations(jobId, translations)

      this.repository.updateProgress(jobId, 70, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: `Translation completed. ${translations.length} segments updated.`,
      })
    } catch (error) {
      const workerError = normalizeWorkerError(error)
      this.repository.markFailed(jobId, workerError.code, workerError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Translation failed: ${workerError.message}`,
      })
      throw workerError
    }
  }
}

function validateTranslationResult(
  sourceSegments: Segment[],
  translatedSegments: Array<{ sequence: number; translatedText: string }>,
): void {
  const expectedSequences = sourceSegments.map((segment) => segment.sequence)
  const actualSequences = translatedSegments.map((segment) => segment.sequence)

  if (expectedSequences.length === 0) {
    return
  }

  if (expectedSequences.length !== actualSequences.length) {
    throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translation response count does not match source segments.')
  }

  const expectedSet = [...expectedSequences].sort((a, b) => a - b)
  const actualSet = [...actualSequences].sort((a, b) => a - b)

  if (expectedSet.some((sequence, index) => sequence !== actualSet[index])) {
    throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translation response sequence set does not match source segments.')
  }

  if (translatedSegments.some((segment) => !segment.translatedText || !segment.translatedText.trim())) {
    throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translated text cannot be empty.')
  }
}

function normalizeWorkerError(error: unknown): WorkerError {
  if (error instanceof WorkerError) {
    return error
  }
  if (error instanceof Error) {
    return new WorkerError('WORKER_EXITED', error.message)
  }
  return new WorkerError('WORKER_EXITED', 'Worker process failed unexpectedly.')
}
