import { contextBridge, ipcRenderer } from 'electron'
import type { CreateJobInput, JobStatus } from '@shared/domain'
import type { SubForgeApi } from '@shared/ipc'

const api: SubForgeApi = {
  jobs: {
    list: (status?: JobStatus) => ipcRenderer.invoke('jobs:list', status),
    get: (id: string) => ipcRenderer.invoke('jobs:get', id),
    create: (input: CreateJobInput) => ipcRenderer.invoke('jobs:create', input),
    getRunning: () => ipcRenderer.invoke('jobs:getRunning'),
  },
  files: {
    selectMedia: () => ipcRenderer.invoke('files:selectMedia'),
  },
}

contextBridge.exposeInMainWorld('subForge', api)
