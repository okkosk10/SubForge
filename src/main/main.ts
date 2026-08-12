import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { DbClient } from './db/database'
import { JobRepository } from './jobs/jobRepository'
import { JobScheduler } from './jobs/jobScheduler'
import { JobService } from './jobs/jobService'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { PipelineOrchestrator } from './pipeline/pipelineOrchestrator'
import { SegmentRepository } from './segments/segmentRepository'
import { PythonWorkerClient } from './worker/pythonWorkerClient'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let dbClient: DbClient | null = null
let workerClient: PythonWorkerClient | null = null

function createWindow(): void {
  const preloadPath = resolvePreloadPath()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    title: 'SubForge',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'subforge.sqlite3')
  dbClient = new DbClient(dbPath)

  const repository = new JobRepository(dbClient.connection)
  const scheduler = new JobScheduler()
  const segmentRepository = new SegmentRepository(dbClient.connection)
  workerClient = new PythonWorkerClient()
  const orchestrator = new PipelineOrchestrator(repository, workerClient, segmentRepository)
  const service = new JobService(repository, scheduler, orchestrator, segmentRepository)
  service.recoverInterruptedJobs()
  service.triggerScheduler()
  registerIpcHandlers(ipcMain, service)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch((error) => {
  console.error('Failed to initialize SubForge main process.', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  workerClient?.dispose()
  workerClient = null
  dbClient?.close()
})

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.mjs'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '../preload/preload.mjs'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/preload.js'),
    path.join(__dirname, '../preload/index.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}
