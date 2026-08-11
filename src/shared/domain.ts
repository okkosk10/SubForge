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

export const SOURCE_LANGUAGE_LABEL: Record<SourceLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
}
