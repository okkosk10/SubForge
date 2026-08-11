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
})
