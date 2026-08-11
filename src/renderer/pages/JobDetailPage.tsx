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
    window.subForge.jobs.get(jobId).then((payload) => {
      if (isMounted) {
        setDetail(payload)
      }
    })

    return () => {
      isMounted = false
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

  const { job, events } = detail

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
      <p className="muted">Transcription results will appear here after processing.</p>
    </section>
  )
}
