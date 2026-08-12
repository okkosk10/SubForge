import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DbClient } from '../database'
import { JobRepository } from '../../jobs/jobRepository'

let db: DbClient | null = null

afterEach(() => {
  db?.close()
  db = null
})

describe('JobRepository', () => {
  it('supports create and read operations', () => {
    db = new DbClient(':memory:')
    const repository = new JobRepository(db.connection)

    const created = repository.insert({
      sourcePath: 'C:/media/sample-a.mp4',
      outputPath: 'C:/media/sample-a.ko.srt',
      sourceLanguage: 'ja',
      targetLanguage: 'ko',
    })

    const fetched = repository.getById(created.id)
    const listed = repository.list()

    expect(fetched?.id).toBe(created.id)
    expect(listed.length).toBe(1)

    const events = repository.getEvents(created.id)
    expect(events.length).toBe(1)
    expect(events[0]?.message).toContain('queued')
  })

  it('persists jobs and events across sqlite reopen', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-persist-'))
    const dbPath = path.join(tempDir, 'subforge.sqlite3')

    try {
      db = new DbClient(dbPath)
      const writeRepository = new JobRepository(db.connection)

      const created = writeRepository.insert({
        sourcePath: 'D:/Media/demo-ja.mp4',
        outputPath: 'D:/Media/demo-ja.ko.srt',
        sourceLanguage: 'ja',
        targetLanguage: 'ko',
      })

      db.close()
      db = null

      db = new DbClient(dbPath)
      const readRepository = new JobRepository(db.connection)

      const restored = readRepository.getById(created.id)
      const restoredEvents = readRepository.getEvents(created.id)

      expect(restored).not.toBeNull()
      expect(restored?.id).toBe(created.id)
      expect(restored?.sourcePath).toBe('D:/Media/demo-ja.mp4')
      expect(restored?.status).toBe('WAITING')
      expect(restored?.sourceLanguage).toBe('ja')
      expect(restored?.targetLanguage).toBe('ko')
      expect(restoredEvents.length).toBeGreaterThan(0)
      expect(restoredEvents[0]?.jobId).toBe(created.id)
      expect(restoredEvents[0]?.message).toContain('queued')
    } finally {
      if (db) {
        db.close()
        db = null
      }
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
