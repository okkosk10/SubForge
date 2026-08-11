import type { Job } from '@shared/domain'
import { MAX_CONCURRENT_JOBS } from './policies'

export class JobScheduler {
  constructor(private readonly maxConcurrentJobs = MAX_CONCURRENT_JOBS) {}

  pickNext(waitingJobs: Job[], runningJobs: Job[]): Job | null {
    if (runningJobs.length >= this.maxConcurrentJobs) {
      return null
    }
    return waitingJobs[0] ?? null
  }
}
