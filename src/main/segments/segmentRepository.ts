import crypto from 'node:crypto'
import type { Database as SQLiteDatabase } from 'better-sqlite3'
import type { Segment } from '@shared/domain'
import { WorkerError } from '../worker/errors'

export interface SegmentInput {
  sequence: number
  startMs: number
  endMs: number
  text: string
}

interface SegmentRow {
  id: string
  job_id: string
  sequence: number
  start_ms: number
  end_ms: number
  source_text: string | null
  translated_text: string | null
  created_at: string
  updated_at: string
}

export class SegmentRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listByJobId(jobId: string): Segment[] {
    const rows = this.db
      .prepare('SELECT * FROM segments WHERE job_id = ? ORDER BY sequence ASC')
      .all(jobId) as SegmentRow[]

    return rows.map(mapSegmentRow)
  }

  replaceForJob(jobId: string, segments: SegmentInput[]): void {
    const sortedSegments = [...segments]
      .map((segment) => ({
        ...segment,
        sequence: Number(segment.sequence),
        startMs: Number(segment.startMs),
        endMs: Number(segment.endMs),
        text: String(segment.text ?? '').trim(),
      }))
      .filter((segment) => segment.text.length > 0)
      .sort((a, b) => a.sequence - b.sequence)

    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM segments WHERE job_id = ?').run(jobId)

      const insert = this.db.prepare(
        `INSERT INTO segments (id, job_id, sequence, start_ms, end_ms, source_text, translated_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )

      const now = new Date().toISOString()
      for (const [index, segment] of sortedSegments.entries()) {
        const sequence = Number.isInteger(segment.sequence) ? segment.sequence : index
        const startMs = segment.startMs
        const endMs = segment.endMs
        if (startMs < 0 || endMs <= startMs) {
          continue
        }

        insert.run(
          crypto.randomUUID(),
          jobId,
          sequence,
          startMs,
          endMs,
          segment.text,
          null,
          now,
          now,
        )
      }
    })

    transaction()
  }

  updateTranslations(
    jobId: string,
    translations: Array<{ sequence: number; translatedText: string }>,
  ): void {
    const normalized = translations.map((translation) => ({
      sequence: Number(translation.sequence),
      translatedText: String(translation.translatedText ?? '').trim(),
    }))

    if (normalized.length === 0) {
      throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translation response is empty.')
    }

    const duplicates = normalized.filter(
      (translation, index, list) => list.findIndex((value) => value.sequence === translation.sequence) !== index,
    )
    if (duplicates.length > 0) {
      throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Duplicate translation sequences are not allowed.')
    }

    if (normalized.some((translation) => !translation.translatedText)) {
      throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translated text cannot be empty.')
    }

    const expectedSequences = this.listByJobId(jobId)
      .filter((segment) => segment.sourceText && segment.sourceText.trim().length > 0)
      .map((segment) => segment.sequence)
      .sort((a, b) => a - b)
    const actualSequences = normalized.map((translation) => translation.sequence).sort((a, b) => a - b)

    if (expectedSequences.length !== actualSequences.length) {
      throw new WorkerError('INVALID_TRANSLATION_RESULT', 'Translation response count does not match source segments.')
    }

    if (expectedSequences.some((sequence, index) => sequence !== actualSequences[index])) {
      throw new WorkerError(
        'INVALID_TRANSLATION_RESULT',
        'Translation response sequence set does not match source segments.',
      )
    }

    const transaction = this.db.transaction(() => {
      const update = this.db.prepare(
        `UPDATE segments
         SET translated_text = ?, updated_at = ?
         WHERE job_id = ? AND sequence = ?`,
      )
      const now = new Date().toISOString()

      for (const translation of normalized) {
        const result = update.run(translation.translatedText, now, jobId, translation.sequence)
        if (result.changes === 0) {
          throw new WorkerError('INVALID_TRANSLATION_RESULT', `No source segment found for sequence ${translation.sequence}.`)
        }
      }
    })

    transaction()
  }

  deleteByJobId(jobId: string): void {
    this.db.prepare('DELETE FROM segments WHERE job_id = ?').run(jobId)
  }
}

function mapSegmentRow(row: SegmentRow): Segment {
  return {
    id: row.id,
    jobId: row.job_id,
    sequence: row.sequence,
    startMs: row.start_ms,
    endMs: row.end_ms,
    sourceText: row.source_text,
    translatedText: row.translated_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
