import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DbClient } from '../../db/database'
import { JobRepository } from '../jobRepository'
import { JobScheduler } from '../jobScheduler'
import { JobService } from '../jobService'

let tempDir = ''
let db: DbClient | null = null
let service: JobService

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-test-'))
  db = new DbClient(':memory:')
  service = new JobService(new JobRepository(db.connection), new JobScheduler())
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
})
