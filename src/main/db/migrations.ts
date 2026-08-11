export interface Migration {
  version: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: '001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        output_path TEXT NOT NULL,
        source_language TEXT NOT NULL CHECK (source_language IN ('ja','en','ru','zh')),
        target_language TEXT NOT NULL DEFAULT 'ko' CHECK (target_language = 'ko'),
        status TEXT NOT NULL CHECK (status IN ('WAITING','RUNNING','COMPLETED','FAILED','CANCELLED')),
        current_step TEXT NULL CHECK (
          current_step IS NULL OR current_step IN (
            'PROBING',
            'SPEECH_ANALYSIS',
            'TRANSCRIBING',
            'TRANSCRIPTION_RECOVERY',
            'TRANSLATING',
            'POST_PROCESSING',
            'VALIDATING',
            'EXPORTING'
          )
        ),
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        error_code TEXT NULL,
        error_message TEXT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_source_path ON jobs(source_path);

      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        source_text TEXT NULL,
        translated_text TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        step TEXT NULL CHECK (
          step IS NULL OR step IN (
            'PROBING',
            'SPEECH_ANALYSIS',
            'TRANSCRIBING',
            'TRANSCRIPTION_RECOVERY',
            'TRANSLATING',
            'POST_PROCESSING',
            'VALIDATING',
            'EXPORTING'
          )
        ),
        level TEXT NOT NULL CHECK (level IN ('INFO','WARNING','ERROR')),
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_job_events_job_id_created_at ON job_events(job_id, created_at);
    `,
  },
]
