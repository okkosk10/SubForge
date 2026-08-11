import { describe, expect, it } from 'vitest'
import type { Job } from '@shared/domain'
import { JobScheduler } from '../jobScheduler'

function makeJob(id: string, status: Job['status']): Job {
  const now = new Date().toISOString()
  return {
    id,
    sourcePath: `${id}.mp4`,
    outputPath: `${id}.ko.srt`,
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    status,
    currentStep: null,
    progress: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }
}

describe('JobScheduler', () => {
  it('selects oldest waiting job when no running jobs exist', () => {
    const scheduler = new JobScheduler(1)
    const waiting = [makeJob('a', 'WAITING'), makeJob('b', 'WAITING')]

    const next = scheduler.pickNext(waiting, [])
    expect(next?.id).toBe('a')
  })

  it('returns null when running jobs reached max concurrency', () => {
    const scheduler = new JobScheduler(1)
    const waiting = [makeJob('a', 'WAITING')]
    const running = [makeJob('r1', 'RUNNING')]

    const next = scheduler.pickNext(waiting, running)
    expect(next).toBeNull()
  })
})
