import type { IpcMain } from 'electron'
import type { JobStatus } from '@shared/domain'
import type { CreateJobResponse, JobDetailPayload } from '@shared/ipc'
import type { JobService } from '../jobs/jobService'

export function registerJobHandlers(ipcMain: IpcMain, jobService: JobService): void {
  ipcMain.handle('jobs:list', (_event, status?: JobStatus) => {
    return jobService.list(status)
  })

  ipcMain.handle('jobs:get', (_event, id: string): JobDetailPayload | null => {
    return jobService.getById(id)
  })

  ipcMain.handle('jobs:create', (_event, input): CreateJobResponse => {
    try {
      const job = jobService.createJob(input)
      return { ok: true, job }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to create job.',
      }
    }
  })

  ipcMain.handle('jobs:getRunning', () => {
    return jobService.getRunningJob()
  })

  ipcMain.handle('jobs:getQueueSnapshot', () => {
    return jobService.getQueueSnapshot()
  })
}
