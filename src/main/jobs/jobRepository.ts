import crypto from 'node:crypto'
import type { Database as SQLiteDatabase } from 'better-sqlite3'
import type {
  EventLevel,
  Job,
  JobEvent,
  JobStatus,
  PipelineStep,
  SourceLanguage,
  TargetLanguage,
} from '@shared/domain'

interface JobRow {
  id: string
  source_path: string
  output_path: string
  source_language: SourceLanguage
  target_language: TargetLanguage
  status: JobStatus
  current_step: PipelineStep | null
  progress: number
  error_code: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

interface JobEventRow {
  id: string
  job_id: string
  step: PipelineStep | null
  level: EventLevel
  message: string
  created_at: string
}

export interface InsertJobInput {
  sourcePath: string
  outputPath: string
  sourceLanguage: SourceLanguage
  targetLanguage: TargetLanguage
}

export class JobRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  list(status?: JobStatus): Job[] {
    const rows = status
      ? this.db
          .prepare('SELECT * FROM jobs WHERE status = ? ORDER BY datetime(created_at) DESC')
          .all(status)
      : this.db.prepare('SELECT * FROM jobs ORDER BY datetime(created_at) DESC').all()

    return (rows as JobRow[]).map(mapJobRow)
  }

  getById(id: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? mapJobRow(row) : null
  }

  getEvents(jobId: string): JobEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY datetime(created_at) ASC')
      .all(jobId) as JobEventRow[]

    return rows.map(mapEventRow)
  }

  getActiveBySourcePath(sourcePath: string): Job | null {
    const row = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE source_path = ?
           AND status IN ('WAITING', 'RUNNING')
         ORDER BY datetime(created_at) DESC
         LIMIT 1`,
      )
      .get(sourcePath) as JobRow | undefined

    return row ? mapJobRow(row) : null
  }

  getRunningJob(): Job | null {
    const row = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'RUNNING'
         ORDER BY datetime(started_at) ASC
         LIMIT 1`,
      )
      .get() as JobRow | undefined

    return row ? mapJobRow(row) : null
  }

  getOldestWaitingJob(): Job | null {
    const row = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'WAITING'
         ORDER BY datetime(created_at) ASC
         LIMIT 1`,
      )
      .get() as JobRow | undefined

    return row ? mapJobRow(row) : null
  }

  insert(input: InsertJobInput): Job {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    this.db
      .prepare(
        `INSERT INTO jobs (
          id, source_path, output_path,
          source_language, target_language,
          status, current_step, progress,
          error_code, error_message,
          created_at, started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'WAITING', NULL, 0, NULL, NULL, ?, NULL, NULL, ?)`,
      )
      .run(
        id,
        input.sourcePath,
        input.outputPath,
        input.sourceLanguage,
        input.targetLanguage,
        now,
        now,
      )

    this.addEvent({
      jobId: id,
      level: 'INFO',
      message: 'Job created and queued.',
      step: null,
    })

    const job = this.getById(id)
    if (!job) {
      throw new Error('Failed to load created job.')
    }
    return job
  }

  updateProgress(jobId: string, progress: number, step: PipelineStep | null): void {
    this.db
      .prepare(
        `UPDATE jobs
         SET progress = ?,
             current_step = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(progress, step, new Date().toISOString(), jobId)
  }

  addEvent(input: {
    jobId: string
    step?: PipelineStep | null
    level: EventLevel
    message: string
  }): JobEvent {
    const createdAt = new Date().toISOString()
    const id = crypto.randomUUID()

    this.db
      .prepare(
        `INSERT INTO job_events (id, job_id, step, level, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.jobId, input.step ?? null, input.level, input.message, createdAt)

    return {
      id,
      jobId: input.jobId,
      step: input.step ?? null,
      level: input.level,
      message: input.message,
      createdAt,
    }
  }
}

function mapJobRow(row: JobRow): Job {
  return {
    id: row.id,
    sourcePath: row.source_path,
    outputPath: row.output_path,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    status: row.status,
    currentStep: row.current_step,
    progress: row.progress,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }
}

function mapEventRow(row: JobEventRow): JobEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    step: row.step,
    level: row.level,
    message: row.message,
    createdAt: row.created_at,
  }
}
