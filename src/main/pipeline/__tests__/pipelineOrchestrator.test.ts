import { describe, expect, it } from 'vitest'
import { DbClient } from '../../db/database'
import { JobRepository } from '../../jobs/jobRepository'
import { PipelineOrchestrator } from '../pipelineOrchestrator'
import type { WorkerClient } from '../../worker/pythonWorkerClient'
import { WorkerError } from '../../worker/errors'
import type { TranslatorProvider } from '../../translation/translatorProvider'

class FakeTranslatorProvider implements TranslatorProvider {
  constructor(private readonly result: { sequence: number; translatedText: string }[] | null = null) {}

  async translateSegments(): Promise<{ sequence: number; translatedText: string }[]> {
    if (!this.result) {
      throw new WorkerError('TRANSLATION_FAILED', 'Translation failed.')
    }
    return this.result
  }
}

class FakeWorkerClient implements WorkerClient {
  constructor(private readonly behavior: 'success' | 'failure') {}

  dispose(): void {
    // no-op for tests
  }

  async probe(): Promise<import('@shared/domain').ProbeMetadata> {
    if (this.behavior === 'failure') {
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
          text: 'こんにちは。今日は少し早く起きました。',
        },
      ],
    }
  }
}

function seedWaitingJob(repository: JobRepository) {
  return repository.insert({
    sourcePath: 'D:/Media/demo-ja.mp4',
    outputPath: 'D:/Media/demo-ja.ko.srt',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
  })
}

describe('PipelineOrchestrator', () => {
  it('moves WAITING job to RUNNING/PROBING and appends probing success events', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'))

      await orchestrator.runProbe(created.id, created.sourcePath)

      const job = repository.getById(created.id)
      expect(job?.status).toBe('RUNNING')
      expect(job?.currentStep).toBe('PROBING')

      const events = repository.getEvents(created.id)
      expect(events.map((event) => event.message)).toContain('Job processing started.')
      expect(events.map((event) => event.message)).toContain('Media probing started.')
      expect(events.map((event) => event.message)).toContain('Media probing completed.')
    } finally {
      db.close()
    }
  })

  it('marks FAILED and records probing error event on worker failure', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('failure'))

      await expect(orchestrator.runProbe(created.id, created.sourcePath)).rejects.toThrow(
        'Failed to probe media file.',
      )

      const job = repository.getById(created.id)
      expect(job?.status).toBe('FAILED')
      expect(job?.currentStep).toBe('PROBING')
      expect(job?.errorCode).toBe('FFPROBE_FAILED')
      expect(job?.errorMessage).toBe('Failed to probe media file.')

      const events = repository.getEvents(created.id)
      expect(events.some((event) => event.level === 'ERROR')).toBe(true)
      expect(
        events.some((event) => event.message.includes('Media probing failed: Failed to probe media file.')),
      ).toBe(true)
    } finally {
      db.close()
    }
  })

  it('keeps transcription success in RUNNING/TRANSCRIBING instead of COMPLETED', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'))

      await orchestrator.runTranscription(created.id, created.sourcePath, 'ja')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('RUNNING')
      expect(job?.currentStep).toBe('TRANSCRIBING')
      expect(job?.progress).toBeLessThan(100)
      expect(job?.completedAt).toBeNull()
    } finally {
      db.close()
    }
  })

  it('runs translation after transcription and stores translated text without completing the job', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [
        { sequence: 0, startMs: 0, endMs: 1000, text: 'こんにちは。今日は少し早く起きました。' },
        { sequence: 1, startMs: 1000, endMs: 2000, text: '午前中は家で仕事をしていました。' },
      ])
      const translator = new FakeTranslatorProvider([
        { sequence: 0, translatedText: '안녕하세요. 오늘은 조금 일찍 일어났어요.' },
        { sequence: 1, translatedText: '오전에는 집에서 일을 하고 있었어요.' },
      ])
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'), segmentRepository, translator)

      await orchestrator.runTranslation(created.id, 'ja')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('RUNNING')
      expect(job?.currentStep).toBe('TRANSLATING')
      expect(job?.progress).toBe(70)
      expect(job?.completedAt).toBeNull()

      const segments = segmentRepository.listByJobId(created.id)
      expect(segments).toHaveLength(2)
      expect(segments.map((segment) => segment.translatedText)).toEqual([
        '안녕하세요. 오늘은 조금 일찍 일어났어요.',
        '오전에는 집에서 일을 하고 있었어요.',
      ])
    } finally {
      db.close()
    }
  })

  it('marks FAILED with error details when translation fails', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [
        { sequence: 0, startMs: 0, endMs: 1000, text: 'こんにちは。' },
      ])
      const orchestrator = new PipelineOrchestrator(
        repository,
        new FakeWorkerClient('success'),
        segmentRepository,
        new FakeTranslatorProvider(null),
      )

      await expect(orchestrator.runTranslation(created.id, 'ja')).rejects.toThrow('Translation failed.')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('FAILED')
      expect(job?.currentStep).toBe('TRANSLATING')
      expect(job?.errorCode).toBe('TRANSLATION_FAILED')
      expect(job?.errorMessage).toBe('Translation failed.')
    } finally {
      db.close()
    }
  })
})
