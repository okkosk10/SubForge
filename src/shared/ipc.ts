import type {
  CreateJobInput,
  Job,
  JobEvent,
  JobStatus,
  SelectableMediaFile,
} from './domain'

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
  }
  files: {
    selectMedia: () => Promise<SelectMediaResponse>
  }
}
