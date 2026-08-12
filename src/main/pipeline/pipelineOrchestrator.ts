import type { PipelineStep, SourceLanguage, TranscriptionSegment } from '@shared/domain'
import type { JobRepository } from '../jobs/jobRepository'
import type { SegmentRepository } from '../segments/segmentRepository'
import type { WorkerClient } from '../worker/pythonWorkerClient'
import { WorkerError } from '../worker/errors'

export class PipelineOrchestrator {
  constructor(
    private readonly repository: JobRepository,
    private readonly workerClient: WorkerClient,
    private readonly segmentRepository?: SegmentRepository,
  ) {}

  async run(jobId: string, sourcePath: string, sourceLanguage: SourceLanguage): Promise<void> {
    await this.runProbe(jobId, sourcePath)
    await this.runTranscription(jobId, sourcePath, sourceLanguage)
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
