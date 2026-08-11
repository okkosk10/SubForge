import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import type { Database as SQLiteDatabase } from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

export class DbClient {
  private db: SQLiteDatabase

  constructor(dbPath: string) {
    const directory = path.dirname(dbPath)
    fs.mkdirSync(directory, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  get connection(): SQLiteDatabase {
    return this.db
  }

  close(): void {
    this.db.close()
  }

  private runMigrations(): void {
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `,
      )
      .run()

    for (const migration of MIGRATIONS) {
      const exists = this.db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1')
        .get(migration.version)

      if (exists) {
        continue
      }

      const tx = this.db.transaction(() => {
        this.db.exec(migration.sql)
        this.db
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString())
      })

      tx()
    }
  }
}
