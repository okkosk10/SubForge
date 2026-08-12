import { useEffect, useState } from 'react'
import type { JobDetailPayload } from '@shared/ipc'
import { formatDate } from '../utils'

interface JobDetailPageProps {
  jobId: string
}

export function JobDetailPage({ jobId }: JobDetailPageProps) {
  const [detail, setDetail] = useState<JobDetailPayload | null>(null)

  useEffect(() => {
    let isMounted = true
    let timer: number | null = null

    const refresh = () => {
      window.subForge.jobs.get(jobId).then((payload) => {
        if (isMounted) {
          setDetail(payload)
          if (payload?.job.status === 'RUNNING') {
            timer = window.setTimeout(refresh, 2000)
          }
        }
      })
    }

    refresh()

    return () => {
      isMounted = false
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [jobId])

  if (!detail) {
    return (
      <section className="panel">
        <h1>Job Detail</h1>
        <p>Job not found.</p>
      </section>
    )
  }

  const { job, events, segments } = detail

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>Job Detail</h1>
      </header>

      <dl className="detail-grid">
        <dt>Source File</dt>
        <dd>{job.sourcePath}</dd>

        <dt>Output Path</dt>
        <dd>{job.outputPath}</dd>

        <dt>Source / Target</dt>
        <dd>
          {job.sourceLanguage} / {job.targetLanguage}
        </dd>

        <dt>Status</dt>
        <dd>{job.status}</dd>

        <dt>Current Step</dt>
        <dd>{job.currentStep ?? '-'}</dd>

        <dt>Progress</dt>
        <dd>{job.progress}%</dd>

        <dt>Created</dt>
        <dd>{formatDate(job.createdAt)}</dd>

        <dt>Started</dt>
        <dd>{formatDate(job.startedAt)}</dd>

        <dt>Completed</dt>
        <dd>{formatDate(job.completedAt)}</dd>

        <dt>Error</dt>
        <dd>{job.errorMessage ?? '-'}</dd>
      </dl>

      <h2>Job Events</h2>
      <ul className="events-list">
        {events.map((event) => (
          <li key={event.id}>
            [{event.level}] {event.step ?? 'QUEUE'} - {event.message} ({formatDate(event.createdAt)})
          </li>
        ))}
        {events.length === 0 ? <li>No events.</li> : null}
      </ul>

      <h2>Segments</h2>
      {segments.length === 0 ? (
        <p className="muted">Transcription results will appear here after processing.</p>
      ) : (
        <ul className="segments-list">
          {segments.map((segment) => (
            <li key={segment.id}>
              <strong>#{segment.sequence + 1}</strong>
              {' '}
              {formatTimestamp(segment.startMs)} → {formatTimestamp(segment.endMs)}
              <div>
                <strong>원문:</strong> {segment.sourceText ?? '—'}
              </div>
              <div>
                <strong>한국어:</strong> {segment.translatedText ?? 'Translation pending'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
}
