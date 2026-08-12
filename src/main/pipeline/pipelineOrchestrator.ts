import path from 'node:path'
import type { PipelineStep, Segment, SourceLanguage, TranscriptionSegment } from '@shared/domain'
import type { JobRepository } from '../jobs/jobRepository'
import type { SegmentRepository } from '../segments/segmentRepository'
import { postProcessTranslatedSegments } from '../subtitles/subtitlePostProcessor'
import { exportSegmentsToSrt } from '../subtitles/srtExporter'
import { validateSegmentsForSrt } from '../subtitles/subtitleValidator'
import type { TranslatorProvider } from '../translation/translatorProvider'
import { LocalTranslatorProvider } from '../translation/providers/localTranslatorProvider'
import type { WorkerClient } from '../worker/pythonWorkerClient'
import { WorkerError } from '../worker/errors'

const TRANSLATION_MAX_ATTEMPTS = 2

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
    await this.runPostProcessing(jobId)
    await this.runValidation(jobId)
    await this.runExport(jobId)
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

      let lastValidationError: WorkerError | null = null
      let translations: Array<{ sequence: number; translatedText: string }> = []

      for (let attempt = 1; attempt <= TRANSLATION_MAX_ATTEMPTS; attempt += 1) {
        translations = await this.translatorProvider.translateSegments({
          sourceLanguage,
          targetLanguage: 'ko',
          segments: translatableSegments.map((segment) => ({
            sequence: segment.sequence,
            sourceText: segment.sourceText ?? '',
          })),
        })

        try {
          validateTranslationResult(translatableSegments, translations, sourceLanguage)
          lastValidationError = null
          break
        } catch (error) {
          const workerError = normalizePipelineError(error, 'INVALID_TRANSLATION_RESULT')
          lastValidationError = workerError

          if (attempt < TRANSLATION_MAX_ATTEMPTS && shouldRetryTranslation(workerError)) {
            this.repository.addEvent({
              jobId,
              step,
              level: 'WARNING',
              message: `Translation validation failed on attempt ${attempt}. Retrying once. (${workerError.message})`,
            })
            continue
          }

          throw workerError
        }
      }

      if (lastValidationError) {
        throw lastValidationError
      }

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

  async runPostProcessing(jobId: string): Promise<void> {
    const step: PipelineStep = 'POST_PROCESSING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Subtitle post-processing started.',
    })

    try {
      if (!this.segmentRepository) {
        throw new WorkerError('POST_PROCESSING_FAILED', 'Segment repository is not configured.')
      }

      const segments = this.segmentRepository.listByJobId(jobId)
      const processed = postProcessTranslatedSegments(segments)
      this.segmentRepository.updateProcessedTranslations(jobId, processed)

      this.repository.updateProgress(jobId, 80, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: 'Subtitle post-processing completed.',
      })
    } catch (error) {
      const pipelineError = normalizePipelineError(error, 'POST_PROCESSING_FAILED')
      this.repository.markFailed(jobId, pipelineError.code, pipelineError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Subtitle post-processing failed: ${pipelineError.message}`,
      })
      throw pipelineError
    }
  }

  async runValidation(jobId: string): Promise<void> {
    const step: PipelineStep = 'VALIDATING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Subtitle validation started.',
    })

    try {
      if (!this.segmentRepository) {
        throw new WorkerError('VALIDATION_FAILED', 'Segment repository is not configured.')
      }

      const segments = this.segmentRepository.listByJobId(jobId)
      const validation = validateSegmentsForSrt(segments)
      if (!validation.ok) {
        const firstIssue = validation.issues[0]
        throw new WorkerError('VALIDATION_FAILED', firstIssue?.message ?? 'Subtitle validation failed.')
      }

      this.repository.updateProgress(jobId, 90, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: 'Subtitle validation completed.',
      })
    } catch (error) {
      const pipelineError = normalizePipelineError(error, 'VALIDATION_FAILED')
      this.repository.markFailed(jobId, pipelineError.code, pipelineError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Subtitle validation failed: ${pipelineError.message}`,
      })
      throw pipelineError
    }
  }

  async runExport(jobId: string): Promise<void> {
    const step: PipelineStep = 'EXPORTING'

    this.repository.markRunning(jobId, step)
    this.repository.addEvent({
      jobId,
      step,
      level: 'INFO',
      message: 'Subtitle export started.',
    })

    try {
      if (!this.segmentRepository) {
        throw new WorkerError('EXPORT_FAILED', 'Segment repository is not configured.')
      }

      const job = this.repository.getById(jobId)
      if (!job) {
        throw new WorkerError('EXPORT_FAILED', 'Job not found for subtitle export.')
      }

      const segments = this.segmentRepository.listByJobId(jobId)
      await exportSegmentsToSrt(job.outputPath, segments)

      this.repository.updateProgress(jobId, 95, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: `Subtitle export completed: ${path.basename(job.outputPath)}`,
      })

      this.repository.markCompleted(jobId, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'INFO',
        message: 'Job completed successfully.',
      })
    } catch (error) {
      const pipelineError = normalizePipelineError(error, 'EXPORT_FAILED')
      this.repository.markFailed(jobId, pipelineError.code, pipelineError.message, step)
      this.repository.addEvent({
        jobId,
        step,
        level: 'ERROR',
        message: `Subtitle export failed: ${pipelineError.message}`,
      })
      throw pipelineError
    }
  }
}

function validateTranslationResult(
  sourceSegments: Segment[],
  translatedSegments: Array<{ sequence: number; translatedText: string }>,
  sourceLanguage: SourceLanguage,
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

  const sourceBySequence = new Map(sourceSegments.map((segment) => [segment.sequence, segment.sourceText ?? '']))
  for (const translated of translatedSegments) {
    const sourceText = sourceBySequence.get(translated.sequence) ?? ''
    if (isLikelyUntranslated(sourceText, translated.translatedText, sourceLanguage)) {
      throw new WorkerError(
        'INVALID_TRANSLATION_RESULT',
        `Translation appears unchanged for sequence ${translated.sequence}.`,
      )
    }
  }
}

function isLikelyUntranslated(sourceText: string, translatedText: string, sourceLanguage: SourceLanguage): boolean {
  const normalizedSource = normalizeComparableText(sourceText)
  const normalizedTranslated = normalizeComparableText(translatedText)

  if (!normalizedSource || !normalizedTranslated) {
    return false
  }

  if (normalizedSource !== normalizedTranslated) {
    return false
  }

  if (sourceLanguage === 'ja') {
    return true
  }

  return normalizedSource.length >= 8
}

function normalizeComparableText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[.,!?;:，。！？、"'(){}<>~`-]/g, '')
    .trim()
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

function normalizePipelineError(error: unknown, fallbackCode: string): WorkerError {
  if (error instanceof WorkerError) {
    return error
  }
  if (error instanceof Error) {
    return new WorkerError(fallbackCode, error.message)
  }
  return new WorkerError(fallbackCode, 'Pipeline step failed unexpectedly.')
}

function shouldRetryTranslation(error: WorkerError): boolean {
  if (error.code === 'INVALID_TRANSLATION_RESULT') {
    return true
  }
  if (error.code === 'TRANSLATION_TIMEOUT') {
    return true
  }
  return false
}
