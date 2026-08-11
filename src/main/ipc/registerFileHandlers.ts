import { dialog } from 'electron'
import type { IpcMain } from 'electron'
import type { SelectMediaResponse } from '@shared/ipc'
import type { JobService } from '../jobs/jobService'

export function registerFileHandlers(ipcMain: IpcMain, jobService: JobService): void {
  ipcMain.handle('files:selectMedia', async (): Promise<SelectMediaResponse> => {
    const result = await dialog.showOpenDialog({
      title: 'Select Media File',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'mkv', 'mov', 'avi', 'wmv'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'Selection canceled.' }
    }

    try {
      const file = jobService.validateSelectedMedia(result.filePaths[0])
      return { ok: true, file }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to validate file.',
      }
    }
  })
}
