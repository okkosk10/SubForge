export type SourceLanguage = 'ja' | 'en' | 'ru' | 'zh'
export type TargetLanguage = 'ko'

export const SOURCE_LANGUAGES: SourceLanguage[] = ['ja', 'en', 'ru', 'zh']

export type JobStatus =
  | 'WAITING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type PipelineStep =
  | 'PROBING'
  | 'SPEECH_ANALYSIS'
  | 'TRANSCRIBING'
  | 'TRANSCRIPTION_RECOVERY'
  | 'TRANSLATING'
  | 'POST_PROCESSING'
  | 'VALIDATING'
  | 'EXPORTING'

export type EventLevel = 'INFO' | 'WARNING' | 'ERROR'

export interface Job {
  id: string
  sourcePath: string
  outputPath: string
  sourceLanguage: SourceLanguage
  targetLanguage: TargetLanguage
  status: JobStatus
  currentStep: PipelineStep | null
  progress: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface JobEvent {
  id: string
  jobId: string
  step: PipelineStep | null
  level: EventLevel
  message: string
  createdAt: string
}

export interface Segment {
  id: string
  jobId: string
  sequence: number
  startMs: number
  endMs: number
  sourceText: string | null
  translatedText: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateJobInput {
  sourcePath: string
  sourceLanguage: SourceLanguage
}

export interface ListJobsQuery {
  status?: JobStatus
}

export interface SelectableMediaFile {
  sourcePath: string
  fileName: string
  suggestedOutputPath: string
}

export interface ProbeMetadata {
  durationMs: number | null
  formatName: string | null
  sizeBytes: number | null
  bitRate: number | null
  video:
    | {
        codec: string | null
        width: number | null
        height: number | null
        fps: number | null
      }
    | null
  audio:
    | {
        codec: string | null
        sampleRate: number | null
        channels: number | null
      }
    | null
}

export type WorkerRequest =
  | {
      requestId: string
      type: 'PROBE'
      payload: {
        sourcePath: string
      }
    }

export type WorkerSuccessResponse = {
  requestId: string
  ok: true
  type: 'PROBE_RESULT'
  payload: ProbeMetadata
}

export type WorkerErrorResponse = {
  requestId: string
  ok: false
  type: 'ERROR'
  error: {
    code: string
    message: string
  }
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

export const SOURCE_LANGUAGE_LABEL: Record<SourceLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
}
