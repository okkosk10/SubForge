import type {
  CreateJobInput,
  Job,
  JobEvent,
  JobStatus,
  SelectableMediaFile,
} from './domain'

export interface QueueSnapshot {
  waitingJobs: Job[]
  runningJobs: Job[]
  nextJob: Job | null
}

export interface CreateJobResponse {
  ok: boolean
  job?: Job
  error?: string
}

export interface SelectMediaResponse {
  ok: boolean
  file?: SelectableMediaFile
  error?: string
}

export interface JobDetailPayload {
  job: Job
  events: JobEvent[]
}

export interface SubForgeApi {
  jobs: {
    list: (status?: JobStatus) => Promise<Job[]>
    get: (id: string) => Promise<JobDetailPayload | null>
    create: (input: CreateJobInput) => Promise<CreateJobResponse>
    getRunning: () => Promise<Job | null>
    getQueueSnapshot: () => Promise<QueueSnapshot>
  }
  files: {
    selectMedia: () => Promise<SelectMediaResponse>
  }
}
