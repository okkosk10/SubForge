import { SOURCE_LANGUAGE_LABEL, type Job, type JobStatus } from '@shared/domain'
import { JOB_STATUS_OPTIONS, formatDate } from '../utils'

interface JobsPageProps {
  jobs: Job[]
  statusFilter: JobStatus | 'ALL'
  onChangeFilter: (status: JobStatus | 'ALL') => void
  onOpenDetail: (id: string) => void
  onRefresh: () => void
}

export function JobsPage({
  jobs,
  statusFilter,
  onChangeFilter,
  onOpenDetail,
  onRefresh,
}: JobsPageProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h1>Jobs</h1>
        <div className="actions">
          <select
            value={statusFilter}
            onChange={(event) => onChangeFilter(event.target.value as JobStatus | 'ALL')}
          >
            {JOB_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      <table className="jobs-table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Source Language</th>
            <th>Status</th>
            <th>Current Step</th>
            <th>Progress</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} onClick={() => onOpenDetail(job.id)}>
              <td>{job.sourcePath.split(/[/\\]/).pop()}</td>
              <td>{SOURCE_LANGUAGE_LABEL[job.sourceLanguage]}</td>
              <td>{job.status}</td>
              <td>{job.currentStep ?? '-'}</td>
              <td>{job.progress}%</td>
              <td>{formatDate(job.createdAt)}</td>
            </tr>
          ))}
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-row">
                No jobs found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  )
}
