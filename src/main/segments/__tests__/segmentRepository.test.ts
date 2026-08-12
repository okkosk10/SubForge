import { describe, expect, it } from 'vitest'
import { DbClient } from '../../db/database'
import { SegmentRepository } from '../segmentRepository'

describe('SegmentRepository', () => {
  const ensureJob = (db: DbClient['connection'], jobId: string) => {
    db.prepare(
      `INSERT OR IGNORE INTO jobs (
        id, source_path, output_path, source_language, target_language,
        status, current_step, progress, error_code, error_message,
        created_at, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'RUNNING', 'TRANSCRIBING', 0, NULL, NULL, ?, NULL, NULL, ?)` ,
    ).run(
      jobId,
      `/tmp/${jobId}.mp4`,
      `/tmp/${jobId}.ko.srt`,
      'ja',
      'ko',
      new Date().toISOString(),
      new Date().toISOString(),
    )
  }

  it('replaces job segments transactionally and keeps translated_text null', () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new SegmentRepository(db.connection)
      ensureJob(db.connection, 'job-1')
      repository.replaceForJob('job-1', [
        {
          sequence: 1,
          startMs: 1200,
          endMs: 4150,
          text: 'こんにちは。',
        },
        {
          sequence: 0,
          startMs: 100,
          endMs: 400,
          text: '早く起きました。',
        },
      ])

      const list = repository.listByJobId('job-1')
      expect(list.map((segment) => segment.sequence)).toEqual([0, 1])
      expect(list[0]?.sourceText).toBe('早く起きました。')
      expect(list[0]?.translatedText).toBeNull()
      expect(list.every((segment) => segment.translatedText === null)).toBe(true)
    } finally {
      db.close()
    }
  })

  it('removes prior segments before inserting replacement set', () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new SegmentRepository(db.connection)
      ensureJob(db.connection, 'job-2')
      repository.replaceForJob('job-2', [
        { sequence: 0, startMs: 0, endMs: 1000, text: 'first' },
      ])
      repository.replaceForJob('job-2', [
        { sequence: 0, startMs: 1000, endMs: 2200, text: 'second' },
        { sequence: 1, startMs: 2200, endMs: 3300, text: 'third' },
      ])

      const list = repository.listByJobId('job-2')
      expect(list).toHaveLength(2)
      expect(list.map((segment) => segment.sourceText)).toEqual(['second', 'third'])
    } finally {
      db.close()
    }
  })

  it('updates translations atomically and preserves source_text', () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new SegmentRepository(db.connection)
      ensureJob(db.connection, 'job-3')
      repository.replaceForJob('job-3', [
        { sequence: 0, startMs: 0, endMs: 200, text: 'こんにちは。' },
        { sequence: 1, startMs: 200, endMs: 500, text: '今日は少し早く起きました。' },
      ])

      repository.updateTranslations('job-3', [
        { sequence: 0, translatedText: '안녕하세요.' },
        { sequence: 1, translatedText: '오늘은 조금 일찍 일어났어요.' },
      ])

      const list = repository.listByJobId('job-3')
      expect(list.map((segment) => segment.sourceText)).toEqual(['こんにちは。', '今日は少し早く起きました。'])
      expect(list.map((segment) => segment.translatedText)).toEqual(['안녕하세요.', '오늘은 조금 일찍 일어났어요.'])
    } finally {
      db.close()
    }
  })

  it('updates post-processed translations without changing source/timestamp fields', () => {
    const db = new DbClient(':memory:')
    try {
      const repository = new SegmentRepository(db.connection)
      ensureJob(db.connection, 'job-4')
      repository.replaceForJob('job-4', [
        { sequence: 0, startMs: 610, endMs: 3590, text: 'こんにちは。今日は少し早く起きました。' },
      ])
      repository.updateTranslations('job-4', [{ sequence: 0, translatedText: '안녕하세요.오늘은   조금 일찍 일어났어요.' }])

      repository.updateProcessedTranslations('job-4', [
        { sequence: 0, translatedText: '안녕하세요. 오늘은 조금 일찍 일어났어요.' },
      ])

      const list = repository.listByJobId('job-4')
      expect(list[0]?.sourceText).toBe('こんにちは。今日は少し早く起きました。')
      expect(list[0]?.startMs).toBe(610)
      expect(list[0]?.endMs).toBe(3590)
      expect(list[0]?.translatedText).toBe('안녕하세요. 오늘은 조금 일찍 일어났어요.')
    } finally {
      db.close()
    }
  })
})
