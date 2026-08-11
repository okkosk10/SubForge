import type { JobStatus } from '@shared/domain'

export function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export const JOB_STATUS_OPTIONS: Array<{ label: string; value: JobStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'WAITING', value: 'WAITING' },
  { label: 'RUNNING', value: 'RUNNING' },
  { label: 'COMPLETED', value: 'COMPLETED' },
  { label: 'FAILED', value: 'FAILED' },
  { label: 'CANCELLED', value: 'CANCELLED' },
]
