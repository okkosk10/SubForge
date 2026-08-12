import fs from 'node:fs'
import type { CreateJobInput, Job, JobStatus, PipelineStep, SourceLanguage } from '@shared/domain'
import type { QueueSnapshot } from '@shared/ipc'
import { SOURCE_LANGUAGES } from '@shared/domain'
import { JobRepository } from './jobRepository'
import { JobScheduler } from './jobScheduler'
import { computeDefaultOutputPath, hasSupportedMediaExtension } from './policies'
import type { SegmentRepository } from '../segments/segmentRepository'
import type { PipelineOrchestrator } from '../pipeline/pipelineOrchestrator'

export class JobService {
  private isTicking = false

  constructor(
    private readonly repository: JobRepository,
    private readonly scheduler: JobScheduler,
    private readonly orchestrator?: PipelineOrchestrator,
    private readonly segmentRepository?: SegmentRepository,
  ) {}

  list(status?: JobStatus): Job[] {
    return this.repository.list(status)
  }

  getById(id: string): { job: Job; events: ReturnType<JobRepository['getEvents']>; segments: ReturnType<SegmentRepository['listByJobId']> } | null {
    const job = this.repository.getById(id)
    if (!job) {
      return null
    }

    return {
      job,
      events: this.repository.getEvents(id),
      segments: this.segmentRepository?.listByJobId(id) ?? [],
    }
  }

  createJob(input: CreateJobInput): Job {
    this.ensureValidSourceLanguage(input.sourceLanguage)
    this.ensureValidSourcePath(input.sourcePath)

    const active = this.repository.getActiveBySourcePath(input.sourcePath)
    if (active) {
      throw new Error('An active job already exists for the selected file.')
    }

    const job = this.repository.insert({
      sourcePath: input.sourcePath,
      outputPath: computeDefaultOutputPath(input.sourcePath),
      sourceLanguage: input.sourceLanguage,
      targetLanguage: 'ko',
    })

    this.triggerScheduler()

    return job
  }

  getRunningJob(): Job | null {
    return this.repository.getRunningJob()
  }

  getQueueSnapshot(): QueueSnapshot {
    const waitingJobs = this.repository.list('WAITING').sort(compareCreatedAtAscending)
    const running = this.repository.getRunningJob()
    const runningJobs = running ? [running] : []
    const nextJob = this.scheduler.pickNext(waitingJobs, runningJobs)

    return { waitingJobs, runningJobs, nextJob }
  }

  updateJobProgress(jobId: string, progress: number, step: PipelineStep | null): void {
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new Error('Progress must be between 0 and 100.')
    }
    this.repository.updateProgress(jobId, Math.round(progress), step)
  }

  recoverInterruptedJobs(): number {
    const runningJobs = this.repository.list('RUNNING')
    for (const job of runningJobs) {
      this.repository.resetRunningToWaiting(job.id)
      this.repository.addEvent({
        jobId: job.id,
        step: null,
        level: 'WARNING',
        message: 'Recovered interrupted job after application restart.',
      })
    }

    return runningJobs.length
  }

  triggerScheduler(): void {
    void this.tick().catch((error) => {
      console.error('[scheduler] tick failed', error)
    })
  }

  async tick(): Promise<void> {
    if (this.isTicking || !this.orchestrator) {
      return
    }

    this.isTicking = true
    try {
      const snapshot = this.getQueueSnapshot()
      const nextJob = this.scheduler.pickNext(snapshot.waitingJobs, snapshot.runningJobs)
      if (!nextJob) {
        return
      }

      await this.orchestrator.run(nextJob.id, nextJob.sourcePath, nextJob.sourceLanguage)
    } finally {
      this.isTicking = false
    }
  }

  validateSelectedMedia(sourcePath: string): {
    sourcePath: string
    fileName: string
    suggestedOutputPath: string
  } {
    this.ensureValidSourcePath(sourcePath)
    return {
      sourcePath,
      fileName: sourcePath.split(/[/\\]/).pop() ?? sourcePath,
      suggestedOutputPath: computeDefaultOutputPath(sourcePath),
    }
  }

  private ensureValidSourceLanguage(language: SourceLanguage): void {
    if (!SOURCE_LANGUAGES.includes(language)) {
      throw new Error('Unsupported source language.')
    }
  }

  private ensureValidSourcePath(sourcePath: string): void {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('Source path is required.')
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error('Selected file does not exist.')
    }

    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) {
      throw new Error('Selected path is not a file.')
    }

    if (!hasSupportedMediaExtension(sourcePath)) {
      throw new Error('Unsupported media extension.')
    }
  }
}

function compareCreatedAtAscending(a: Job, b: Job): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
