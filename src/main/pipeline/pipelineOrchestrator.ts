import type { PipelineStep } from '@shared/domain'
import type { JobRepository } from '../jobs/jobRepository'
import type { WorkerClient } from '../worker/pythonWorkerClient'
import { WorkerError } from '../worker/errors'

export class PipelineOrchestrator {
  constructor(
    private readonly repository: JobRepository,
    private readonly workerClient: WorkerClient,
  ) {}

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
