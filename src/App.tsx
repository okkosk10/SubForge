import { useCallback, useEffect, useState } from 'react'
import type { Job, JobStatus } from '@shared/domain'
import { Sidebar } from './renderer/components/Sidebar'
import { JobDetailPage } from './renderer/pages/JobDetailPage'
import { JobsPage } from './renderer/pages/JobsPage'
import { NewJobPage } from './renderer/pages/NewJobPage'
import { SettingsPage } from './renderer/pages/SettingsPage'
import type { PageKey } from './renderer/types'
import './App.css'

function App() {
  const [page, setPage] = useState<PageKey>('jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL')

  const refreshJobs = useCallback(async () => {
    const data = await window.subForge.jobs.list(statusFilter === 'ALL' ? undefined : statusFilter)
    setJobs(data)
  }, [statusFilter])

  useEffect(() => {
    void refreshJobs()
  }, [refreshJobs])

  function openDetail(id: string): void {
    setSelectedJobId(id)
    setPage('job-detail')
  }

  function renderMain() {
    if (page === 'jobs') {
      return (
        <JobsPage
          jobs={jobs}
          statusFilter={statusFilter}
          onChangeFilter={setStatusFilter}
          onOpenDetail={openDetail}
          onRefresh={refreshJobs}
        />
      )
    }

    if (page === 'new-job') {
      return (
        <NewJobPage
          onJobCreated={(id) => {
            setSelectedJobId(id)
            setPage('job-detail')
            void refreshJobs()
          }}
        />
      )
    }

    if (page === 'job-detail' && selectedJobId) {
      return <JobDetailPage jobId={selectedJobId} />
    }

    return <SettingsPage />
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        onNavigate={(nextPage) => {
          setPage(nextPage)
        }}
      />
      <main className="content">{renderMain()}</main>
    </div>
  )
}

export default App
