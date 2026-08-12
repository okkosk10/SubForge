import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbClient } from '../../db/database'
import { JobRepository } from '../jobRepository'
import { JobScheduler } from '../jobScheduler'
import { JobService } from '../jobService'
import { PipelineOrchestrator } from '../../pipeline/pipelineOrchestrator'
import { SegmentRepository } from '../../segments/segmentRepository'
import type { WorkerClient } from '../../worker/pythonWorkerClient'
import { WorkerError } from '../../worker/errors'
import type { TranslatorProvider } from '../../translation/translatorProvider'

let tempDir = ''
let db: DbClient | null = null
let repository: JobRepository
let service: JobService

class FakeWorkerClient implements WorkerClient {
  constructor(private readonly mode: 'success' | 'failure' = 'success') {}

  dispose(): void {
    // no-op
  }

  async probe(): Promise<import('@shared/domain').ProbeMetadata> {
    if (this.mode === 'failure') {
      throw new WorkerError('FFPROBE_FAILED', 'Failed to probe media file.')
    }

    return {
      durationMs: 1000,
      formatName: 'mp4',
      sizeBytes: 100,
      bitRate: 80,
      video: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
      },
      audio: {
        codec: 'aac',
        sampleRate: 48000,
        channels: 2,
      },
    }
  }

  async transcribe(): Promise<import('@shared/domain').TranscriptionResult> {
    return {
      segments: [
        {
          sequence: 0,
          startMs: 1200,
          endMs: 4150,
          text: 'こんにちは。',
        },
      ],
    }
  }
}

class FailOnceWorkerClient implements WorkerClient {
  private attempt = 0

  dispose(): void {
    // no-op
  }

  async probe(): Promise<import('@shared/domain').ProbeMetadata> {
    this.attempt += 1
    if (this.attempt === 1) {
      throw new WorkerError('FFPROBE_FAILED', 'First probe failed.')
    }

    return {
      durationMs: 1000,
      formatName: 'mp4',
      sizeBytes: 100,
      bitRate: 80,
      video: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
      },
      audio: {
        codec: 'aac',
        sampleRate: 48000,
        channels: 2,
      },
    }
  }

  async transcribe(): Promise<import('@shared/domain').TranscriptionResult> {
    return {
      segments: [
        {
          sequence: 0,
          startMs: 100,
          endMs: 500,
          text: 'transcribed',
        },
      ],
    }
  }
}

class FakeTranslatorProvider implements TranslatorProvider {
  async translateSegments(input: {
    sourceLanguage: import('@shared/domain').SourceLanguage
    targetLanguage: 'ko'
    segments: Array<{ sequence: number; sourceText: string }>
  }): Promise<Array<{ sequence: number; translatedText: string }>> {
    return input.segments.map((segment) => ({
      sequence: segment.sequence,
      translatedText: `ko:${segment.sourceText}`,
    }))
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-test-'))
  db = new DbClient(':memory:')
  repository = new JobRepository(db.connection)
  service = new JobService(repository, new JobScheduler())
})

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  db?.close()
  db = null
})

function createMediaFile(name = 'sample.mp4'): string {
  const mediaPath = path.join(tempDir, name)
  fs.writeFileSync(mediaPath, 'dummy')
  return mediaPath
}

describe('JobService', () => {
  it('creates waiting job for valid file and language', () => {
    const sourcePath = createMediaFile('movie.mp4')

    const job = service.createJob({ sourcePath, sourceLanguage: 'ja' })

    expect(job.status).toBe('WAITING')
    expect(job.sourceLanguage).toBe('ja')
    expect(job.targetLanguage).toBe('ko')
    expect(job.outputPath.endsWith('.ko.srt')).toBe(true)
  })

  it('rejects unsupported source language', () => {
    const sourcePath = createMediaFile('movie.mp4')

    expect(() =>
      service.createJob({
        sourcePath,
        sourceLanguage: 'fr' as never,
      }),
    ).toThrow('Unsupported source language.')
  })

  it('rejects duplicate active job on same source path', () => {
    const sourcePath = createMediaFile('movie.mp4')

    service.createJob({ sourcePath, sourceLanguage: 'ja' })

    expect(() => service.createJob({ sourcePath, sourceLanguage: 'en' })).toThrow(
      'An active job already exists for the selected file.',
    )
  })

  it('validates progress range', () => {
    const sourcePath = createMediaFile('movie.mp4')
    const job = service.createJob({ sourcePath, sourceLanguage: 'ja' })

    expect(() => service.updateJobProgress(job.id, -1, null)).toThrow(
      'Progress must be between 0 and 100.',
    )
    expect(() => service.updateJobProgress(job.id, 101, null)).toThrow(
      'Progress must be between 0 and 100.',
    )
  })

  it('rejects unsupported extension', () => {
    const sourcePath = createMediaFile('movie.txt')

    expect(() => service.createJob({ sourcePath, sourceLanguage: 'ja' })).toThrow(
      'Unsupported media extension.',
    )
  })

  it('returns oldest waiting as next job when no running job exists', () => {
    const aPath = createMediaFile('a.mp4')
    const bPath = createMediaFile('b.mp4')

    const jobA = service.createJob({ sourcePath: aPath, sourceLanguage: 'ja' })
    service.createJob({ sourcePath: bPath, sourceLanguage: 'en' })

    const snapshot = service.getQueueSnapshot()

    expect(snapshot.waitingJobs.length).toBe(2)
    expect(snapshot.runningJobs).toEqual([])
    expect(snapshot.nextJob?.id).toBe(jobA.id)
  })

  it('returns null next job when a running job already exists', () => {
    const runningPath = createMediaFile('running.mp4')
    const waitingPath = createMediaFile('waiting.mp4')

    const running = repository.insert({
      sourcePath: runningPath,
      outputPath: runningPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    db?.connection
      .prepare(
        `UPDATE jobs
         SET status = 'RUNNING',
             started_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), new Date().toISOString(), running.id)

    service.createJob({ sourcePath: waitingPath, sourceLanguage: 'en' })

    const snapshot = service.getQueueSnapshot()

    expect(snapshot.runningJobs.length).toBe(1)
    expect(snapshot.runningJobs[0]?.id).toBe(running.id)
    expect(snapshot.waitingJobs.length).toBe(1)
    expect(snapshot.nextJob).toBeNull()
  })

  it('recovers interrupted running jobs to waiting on startup recovery', () => {
    const sourcePath = createMediaFile('recover.mp4')
    const job = repository.insert({
      sourcePath,
      outputPath: sourcePath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    db?.connection
      .prepare(
        `UPDATE jobs
         SET status = 'RUNNING',
             current_step = 'PROBING',
             progress = 42,
             started_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), new Date().toISOString(), job.id)

    const recoveredCount = service.recoverInterruptedJobs()
    const recovered = repository.getById(job.id)
    const events = repository.getEvents(job.id)

    expect(recoveredCount).toBe(1)
    expect(recovered?.status).toBe('WAITING')
    expect(recovered?.currentStep).toBeNull()
    expect(recovered?.progress).toBe(0)
    expect(events.some((event) => event.level === 'WARNING')).toBe(true)
    expect(
      events.some((event) => event.message.includes('Recovered interrupted job after application restart.')),
    ).toBe(true)
  })

  it('starts waiting job on tick with RUNNING/PROBING then TRANSCRIBING transition', async () => {
    if (!db) {
      throw new Error('Database was not initialized.')
    }

    const sourcePath = createMediaFile('tick.mp4')
    const waiting = repository.insert({
      sourcePath,
      outputPath: sourcePath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const segmentRepository = new SegmentRepository(db.connection)
    const orchestrator = new PipelineOrchestrator(
      repository,
      new FakeWorkerClient('success'),
      segmentRepository,
      new FakeTranslatorProvider(),
    )
    const runService = new JobService(repository, new JobScheduler(), orchestrator, segmentRepository)

    await runService.tick()

    const updated = repository.getById(waiting.id)
    expect(updated?.status).toBe('COMPLETED')
    expect(updated?.currentStep).toBe('EXPORTING')
    expect(updated?.progress).toBe(100)
    expect(updated?.completedAt).not.toBeNull()

    const events = repository.getEvents(waiting.id)
    expect(events.some((event) => event.message === 'Media probing completed.')).toBe(true)
    expect(events.some((event) => event.message.includes('Transcription completed.'))).toBe(true)
    expect(events.some((event) => event.message.includes('Translation completed.'))).toBe(true)
    expect(events.some((event) => event.message === 'Subtitle post-processing completed.')).toBe(true)
    expect(events.some((event) => event.message === 'Subtitle validation completed.')).toBe(true)
    expect(events.some((event) => event.message.includes('Subtitle export completed:'))).toBe(true)
  })

  it('marks failed when probing fails on tick', async () => {
    const sourcePath = createMediaFile('tick-fail.mp4')
    const waiting = repository.insert({
      sourcePath,
      outputPath: sourcePath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('failure'))
    const runService = new JobService(repository, new JobScheduler(), orchestrator)

    await expect(runService.tick()).rejects.toThrow('Failed to probe media file.')

    const updated = repository.getById(waiting.id)
    expect(updated?.status).toBe('FAILED')
    expect(updated?.errorCode).toBe('FFPROBE_FAILED')
    expect(updated?.errorMessage).toBe('Failed to probe media file.')
  })

  it('catches triggerScheduler rejection and keeps process safe', async () => {
    const sourcePath = createMediaFile('trigger-fail.mp4')
    const waiting = repository.insert({
      sourcePath,
      outputPath: sourcePath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('failure'))
    const runService = new JobService(repository, new JobScheduler(), orchestrator)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    runService.triggerScheduler()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const updated = repository.getById(waiting.id)
    expect(updated?.status).toBe('FAILED')
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('releases tick lock after failure so next tick can run', async () => {
    if (!db) {
      throw new Error('Database was not initialized.')
    }

    const firstPath = createMediaFile('first.mp4')
    const secondPath = createMediaFile('second.mp4')

    const first = repository.insert({
      sourcePath: firstPath,
      outputPath: firstPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const second = repository.insert({
      sourcePath: secondPath,
      outputPath: secondPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'en',
      targetLanguage: 'ko',
    })

    const segmentRepository = new SegmentRepository(db.connection)
    const orchestrator = new PipelineOrchestrator(
      repository,
      new FailOnceWorkerClient(),
      segmentRepository,
      new FakeTranslatorProvider(),
    )
    const runService = new JobService(repository, new JobScheduler(), orchestrator, segmentRepository)

    await expect(runService.tick()).rejects.toThrow('First probe failed.')

    const firstUpdated = repository.getById(first.id)
    const secondUpdated = repository.getById(second.id)
    expect(firstUpdated?.status).toBe('FAILED')
    expect(secondUpdated?.status).toBe('COMPLETED')
    expect(secondUpdated?.currentStep).toBe('EXPORTING')
    expect(secondUpdated?.progress).toBe(100)
  })

  it('continues queue after first job succeeds', async () => {
    if (!db) {
      throw new Error('Database was not initialized.')
    }

    const firstPath = createMediaFile('queue-a.mp4')
    const secondPath = createMediaFile('queue-b.mp4')

    const first = repository.insert({
      sourcePath: firstPath,
      outputPath: firstPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const second = repository.insert({
      sourcePath: secondPath,
      outputPath: secondPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'en',
      targetLanguage: 'ko',
    })

    const segmentRepository = new SegmentRepository(db.connection)
    const orchestrator = new PipelineOrchestrator(
      repository,
      new FakeWorkerClient('success'),
      segmentRepository,
      new FakeTranslatorProvider(),
    )
    const runService = new JobService(repository, new JobScheduler(), orchestrator, segmentRepository)

    await runService.tick()

    const firstUpdated = repository.getById(first.id)
    const secondUpdated = repository.getById(second.id)
    expect(firstUpdated?.status).toBe('COMPLETED')
    expect(secondUpdated?.status).toBe('COMPLETED')
  })

  it('keeps failure isolation and still processes next waiting job', async () => {
    if (!db) {
      throw new Error('Database was not initialized.')
    }

    const firstPath = createMediaFile('isolation-a.mp4')
    const secondPath = createMediaFile('isolation-b.mp4')

    const first = repository.insert({
      sourcePath: firstPath,
      outputPath: firstPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const second = repository.insert({
      sourcePath: secondPath,
      outputPath: secondPath.replace('.mp4', '.ko.srt'),
      sourceLanguage: 'en',
      targetLanguage: 'ko',
    })

    const segmentRepository = new SegmentRepository(db.connection)
    const orchestrator = new PipelineOrchestrator(
      repository,
      new FailOnceWorkerClient(),
      segmentRepository,
      new FakeTranslatorProvider(),
    )
    const runService = new JobService(repository, new JobScheduler(), orchestrator, segmentRepository)

    await expect(runService.tick()).rejects.toThrow('First probe failed.')

    const firstUpdated = repository.getById(first.id)
    const secondUpdated = repository.getById(second.id)
    expect(firstUpdated?.status).toBe('FAILED')
    expect(secondUpdated?.status).toBe('COMPLETED')
  })
})
