import type { IpcMain } from 'electron'
import { registerFileHandlers } from './registerFileHandlers'
import { registerJobHandlers } from './registerJobHandlers'
import type { JobService } from '../jobs/jobService'

export function registerIpcHandlers(ipcMain: IpcMain, jobService: JobService): void {
  registerJobHandlers(ipcMain, jobService)
  registerFileHandlers(ipcMain, jobService)
}
