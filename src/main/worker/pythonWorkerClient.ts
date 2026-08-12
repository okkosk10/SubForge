import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { ProbeMetadata, SourceLanguage, TranscriptionResult, WorkerRequest } from '@shared/domain'
import { WorkerError } from './errors'
import { parseWorkerResponseLine } from './workerProtocol'

const PROBE_TIMEOUT_MS = 30_000
const TRANSCRIBE_TIMEOUT_MS = 30 * 60 * 1000

export interface WorkerClient {
  probe(sourcePath: string): Promise<ProbeMetadata>
  transcribe(sourcePath: string, sourceLanguage: SourceLanguage): Promise<TranscriptionResult>
  dispose(): void
}

export interface PythonWorkerClientOptions {
  pythonExecutable?: string
  timeoutMs?: number
}

export function buildPythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  }
}

export class PythonWorkerClient implements WorkerClient {
  private readonly timeoutMs: number
  private readonly pythonExecutable: string

  constructor(options: PythonWorkerClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
    this.pythonExecutable = options.pythonExecutable ?? resolvePythonExecutable()
  }

  dispose(): void {
    // One-shot process per request has no persistent resources to dispose.
  }

  async probe(sourcePath: string): Promise<ProbeMetadata> {
    const request: WorkerRequest = {
      requestId: crypto.randomUUID(),
      type: 'PROBE',
      payload: { sourcePath },
    }

    const response = await this.runRequest<ProbeMetadata>(request, this.timeoutMs)
    return response
  }

  async transcribe(sourcePath: string, sourceLanguage: SourceLanguage): Promise<TranscriptionResult> {
    const request: WorkerRequest = {
      requestId: crypto.randomUUID(),
      type: 'TRANSCRIBE',
      payload: { sourcePath, sourceLanguage },
    }

    const response = await this.runRequest<TranscriptionResult>(request, TRANSCRIBE_TIMEOUT_MS)
    return response
  }

  private async runRequest<T>(request: WorkerRequest, timeoutMs: number): Promise<T> {
    const workerMainPath = resolveWorkerMainPath()
    const args = [workerMainPath, '--request', JSON.stringify(request)]

    const child = spawn(this.pythonExecutable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: buildPythonEnv(),
    })

    return await new Promise<T>((resolve, reject) => {
      let settled = false
      let stdoutBuffer = ''
      let stderrBuffer = ''

      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        child.kill('SIGKILL')
        reject(new WorkerError('WORKER_TIMEOUT', 'Worker did not respond in time.'))
      }, timeoutMs)

      const finalizeError = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        child.kill('SIGKILL')
        reject(error)
      }

      child.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          finalizeError(new WorkerError('PYTHON_NOT_FOUND', 'Python executable was not found.'))
          return
        }
        finalizeError(new WorkerError('WORKER_START_FAILED', error.message))
      })

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8')
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8')
      })

      child.on('close', (code) => {
        if (settled) {
          return
        }

        clearTimeout(timer)

        const lines = stdoutBuffer
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)

        if (lines.length === 0) {
          settled = true
          const suffix = stderrBuffer.trim() ? ` ${stderrBuffer.trim()}` : ''
          reject(new WorkerError('WORKER_EXITED', `Worker exited without protocol response.${suffix}`))
          return
        }

        let response
        try {
          response = parseWorkerResponseLine(lines[lines.length - 1])
        } catch (error) {
          settled = true
          reject(error instanceof Error ? error : new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker protocol parsing failed.'))
          return
        }

        if (response.requestId !== request.requestId) {
          settled = true
          reject(new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker response requestId mismatch.'))
          return
        }

        if (response.ok) {
          settled = true
          resolve(response.payload as T)
          return
        }

        settled = true
        reject(new WorkerError(response.error.code, response.error.message))

        if (code !== 0 && stderrBuffer.trim()) {
          console.error(`[python-worker] exited with code=${code}: ${stderrBuffer.trim()}`)
        }
      })
    })
  }
}

export function resolvePythonExecutable(): string {
  return process.platform === 'win32' ? 'python' : 'python3'
}

function resolveWorkerMainPath(): string {
  const currentFilePath = fileURLToPath(import.meta.url)
  const currentDir = path.dirname(currentFilePath)
  const candidates = [
    path.resolve(currentDir, '../../../worker/main.py'),
    path.resolve(currentDir, '../../worker/main.py'),
    path.resolve(currentDir, '../worker/main.py'),
    path.resolve(process.cwd(), 'worker/main.py'),
    path.resolve(process.cwd(), 'SubForge/worker/main.py'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}
