import type { WorkerResponse } from '@shared/domain'
import { WorkerError } from './errors'

export function parseWorkerResponseLine(line: string): WorkerResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker returned malformed JSON response.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker response must be a JSON object.')
  }

  const value = parsed as Record<string, unknown>
  if (typeof value.requestId !== 'string') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker response requestId is missing.')
  }
  if (typeof value.ok !== 'boolean') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker response ok flag is missing.')
  }
  if (typeof value.type !== 'string') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker response type is missing.')
  }

  if (value.ok) {
    const allowedSuccessTypes = new Set(['PROBE_RESULT', 'TRANSCRIBE_RESULT'])
    if (!allowedSuccessTypes.has(value.type)) {
      throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker success response type is unsupported.')
    }
    if (!value.payload || typeof value.payload !== 'object') {
      throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker success payload is missing.')
    }
    return value as WorkerResponse
  }

  if (value.type !== 'ERROR') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker failure response type must be ERROR.')
  }
  if (!value.error || typeof value.error !== 'object') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker error payload is missing.')
  }

  const error = value.error as Record<string, unknown>
  if (typeof error.code !== 'string' || typeof error.message !== 'string') {
    throw new WorkerError('WORKER_PROTOCOL_ERROR', 'Worker error payload is invalid.')
  }

  return value as WorkerResponse
}
