import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

class FlakyTranslatorProvider implements TranslatorProvider {
  private attempt = 0

  async translateSegments(): Promise<{ sequence: number; translatedText: string }[]> {
    this.attempt += 1
    if (this.attempt === 1) {
      return [{ sequence: 0, translatedText: 'こんにちは 今日は友達とカフェに来ました' }]
    }
    return [{ sequence: 0, translatedText: '안녕하세요. 오늘은 친구와 카페에 왔어요.' }]
  }
}

class ObservableTranslatorProvider implements TranslatorProvider {
  private metadata: import('../../translation/translatorProvider').TranslationRunMetadata | null = null

  async translateSegments(): Promise<{ sequence: number; translatedText: string }[]> {
    this.metadata = {
      provider: 'aihub-ja-ko',
      fallbackUsed: false,
      timing: {
        modelLoadMs: 1000,
        inferenceMs: 120,
        totalMs: 1120,
      },
    }
    return [{ sequence: 0, translatedText: '테스트 번역' }]
  }

  getLastTranslationMetadata() {
    return this.metadata
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
          startMs: 610,
          endMs: 3590,
          text: 'こんにちは。今日は少し早く起きました。',
        },
        {
          sequence: 1,
          startMs: 8410,
          endMs: 10430,
          text: '午前中は家で仕事をしていました。',
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

  it('marks FAILED when translation result is unchanged from Japanese source text', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [
        { sequence: 0, startMs: 0, endMs: 1000, text: 'こんにちは 今日は友達とカフェに来ました' },
      ])
      const translator = new FakeTranslatorProvider([
        { sequence: 0, translatedText: 'こんにちは 今日は友達とカフェに来ました' },
      ])
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'), segmentRepository, translator)

      await expect(orchestrator.runTranslation(created.id, 'ja')).rejects.toThrow(
        'Translation appears unchanged for sequence 0.',
      )

      const job = repository.getById(created.id)
      expect(job?.status).toBe('FAILED')
      expect(job?.currentStep).toBe('TRANSLATING')
      expect(job?.errorCode).toBe('INVALID_TRANSLATION_RESULT')
      expect(job?.errorMessage).toBe('Translation appears unchanged for sequence 0.')
    } finally {
      db.close()
    }
  })

  it('retries translation once when first result is invalid and succeeds on second attempt', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [
        { sequence: 0, startMs: 0, endMs: 1000, text: 'こんにちは 今日は友達とカフェに来ました' },
      ])
      const orchestrator = new PipelineOrchestrator(
        repository,
        new FakeWorkerClient('success'),
        segmentRepository,
        new FlakyTranslatorProvider(),
      )

      await orchestrator.runTranslation(created.id, 'ja')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('RUNNING')
      expect(job?.currentStep).toBe('TRANSLATING')

      const events = repository.getEvents(created.id)
      expect(
        events.some(
          (event) =>
            event.level === 'WARNING' && event.message.includes('Translation validation failed on attempt 1.'),
        ),
      ).toBe(true)

      const segments = segmentRepository.listByJobId(created.id)
      expect(segments[0]?.translatedText).toBe('안녕하세요. 오늘은 친구와 카페에 왔어요.')
    } finally {
      db.close()
    }
  })

  it('records provider and timing metadata events from translator provider', async () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new JobRepository(db.connection)
      const created = seedWaitingJob(repository)
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [
        { sequence: 0, startMs: 0, endMs: 1000, text: '明日は雨が降るかもしれません。' },
      ])

      const orchestrator = new PipelineOrchestrator(
        repository,
        new FakeWorkerClient('success'),
        segmentRepository,
        new ObservableTranslatorProvider(),
      )

      await orchestrator.runTranslation(created.id, 'ja')

      const events = repository.getEvents(created.id)
      expect(events.some((event) => event.message === 'Translation provider: aihub-ja-ko.')).toBe(true)
      expect(events.some((event) => event.message.includes('Translation timing (aihub-ja-ko):'))).toBe(true)
    } finally {
      db.close()
    }
  })

  it('completes full pipeline and exports SRT before marking COMPLETED', async () => {
    const db = new DbClient(':memory:')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-pipeline-'))
    try {
      const sourcePath = path.join(tempDir, 'demo-ja.mp4')
      const outputPath = path.join(tempDir, 'demo-ja.ko.srt')
      fs.writeFileSync(sourcePath, 'dummy media')

      const repository = new JobRepository(db.connection)
      const created = repository.insert({
        sourcePath,
        outputPath,
        sourceLanguage: 'ja',
        targetLanguage: 'ko',
      })
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      const translator = new FakeTranslatorProvider([
        { sequence: 0, translatedText: '안녕하세요.오늘은   조금 일찍 일어났어요.' },
        { sequence: 1, translatedText: '오전에는 집에서 일을 하고 있었어요.' },
      ])
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'), segmentRepository, translator)

      await orchestrator.run(created.id, sourcePath, 'ja')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('COMPLETED')
      expect(job?.currentStep).toBe('EXPORTING')
      expect(job?.progress).toBe(100)
      expect(job?.completedAt).not.toBeNull()

      const events = repository.getEvents(created.id)
      expect(events.some((event) => event.message === 'Subtitle post-processing started.')).toBe(true)
      expect(events.some((event) => event.message === 'Subtitle post-processing completed.')).toBe(true)
      expect(events.some((event) => event.message === 'Subtitle validation started.')).toBe(true)
      expect(events.some((event) => event.message === 'Subtitle validation completed.')).toBe(true)
      expect(events.some((event) => event.message === 'Subtitle export started.')).toBe(true)
      expect(events.some((event) => event.message.includes('Subtitle export completed:'))).toBe(true)

      expect(fs.existsSync(outputPath)).toBe(true)
      const exported = fs.readFileSync(outputPath, 'utf8')
      expect(exported).toContain('1\n00:00:00,610 --> 00:00:03,590\n안녕하세요. 오늘은 조금 일찍 일어났어요.')
      expect(exported).toContain('2\n00:00:08,410 --> 00:00:10,430\n오전에는 집에서 일을 하고 있었어요.')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      db.close()
    }
  })

  it('fails at VALIDATING with VALIDATION_FAILED when translated text is missing', async () => {
    const db = new DbClient(':memory:')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-validate-'))
    try {
      const sourcePath = path.join(tempDir, 'demo.mp4')
      const outputPath = path.join(tempDir, 'demo.ko.srt')
      fs.writeFileSync(sourcePath, 'dummy media')

      const repository = new JobRepository(db.connection)
      const created = repository.insert({
        sourcePath,
        outputPath,
        sourceLanguage: 'ja',
        targetLanguage: 'ko',
      })
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      segmentRepository.replaceForJob(created.id, [{ sequence: 0, startMs: 0, endMs: 1000, text: 'こんにちは。' }])
      const translator = new FakeTranslatorProvider([{ sequence: 0, translatedText: '   ' }])
      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'), segmentRepository, translator)

      await expect(orchestrator.run(created.id, sourcePath, 'ja')).rejects.toThrow()

      const job = repository.getById(created.id)
      expect(job?.status).toBe('FAILED')
      expect(job?.currentStep).toBe('TRANSLATING')
      expect(job?.errorCode).toBe('INVALID_TRANSLATION_RESULT')
      expect(fs.existsSync(outputPath)).toBe(false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      db.close()
    }
  })

  it('fails at VALIDATING for invalid timestamp and does not create output file', async () => {
    const db = new DbClient(':memory:')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-invalid-time-'))
    try {
      const sourcePath = path.join(tempDir, 'demo.mp4')
      const outputPath = path.join(tempDir, 'demo.ko.srt')
      fs.writeFileSync(sourcePath, 'dummy media')

      const repository = new JobRepository(db.connection)
      const created = repository.insert({
        sourcePath,
        outputPath,
        sourceLanguage: 'ja',
        targetLanguage: 'ko',
      })
      const segmentRepository = new (await import('../../segments/segmentRepository')).SegmentRepository(db.connection)
      const now = new Date().toISOString()
      db.connection
        .prepare(
          `INSERT INTO segments (id, job_id, sequence, start_ms, end_ms, source_text, translated_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'invalid-segment-1',
          created.id,
          0,
          2000,
          1000,
          'こんにちは。',
          '안녕하세요.',
          now,
          now,
        )

      const orchestrator = new PipelineOrchestrator(repository, new FakeWorkerClient('success'), segmentRepository)
      await expect(orchestrator.runValidation(created.id)).rejects.toThrow('Segment 0 has non-positive duration.')

      const job = repository.getById(created.id)
      expect(job?.status).toBe('FAILED')
      expect(job?.currentStep).toBe('VALIDATING')
      expect(job?.errorCode).toBe('VALIDATION_FAILED')
      expect(fs.existsSync(outputPath)).toBe(false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      db.close()
    }
  })
})
