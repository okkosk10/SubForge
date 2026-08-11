import type { Job } from '@shared/domain'

export type PageKey = 'jobs' | 'new-job' | 'job-detail' | 'settings'

export interface AppState {
  page: PageKey
  selectedJobId: string | null
  jobs: Job[]
}
