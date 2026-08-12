import fs from 'node:fs/promises'
import path from 'node:path'
import type { Segment } from '@shared/domain'
import { WorkerError } from '../worker/errors'

export function formatSrtTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new WorkerError('EXPORT_FAILED', `Invalid timestamp value: ${ms}`)
  }

  const totalMs = Math.floor(ms)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const milliseconds = totalMs % 1000

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`
}

export function serializeSegmentsToSrt(segments: Segment[]): string {
  const ordered = [...segments].sort((a, b) => a.sequence - b.sequence)
  const blocks = ordered.map((segment, index) => {
    const content = (segment.translatedText ?? '').trim()
    return [
      String(index + 1),
      `${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}`,
      content,
    ].join('\n')
  })

  return `${blocks.join('\n\n')}\n\n`
}

export async function exportSegmentsToSrt(outputPath: string, segments: Segment[]): Promise<void> {
  const outputDirectory = path.dirname(outputPath)

  let directoryStat
  try {
    directoryStat = await fs.stat(outputDirectory)
  } catch {
    throw new WorkerError('EXPORT_FAILED', `Output directory does not exist: ${outputDirectory}`)
  }

  if (!directoryStat.isDirectory()) {
    throw new WorkerError('EXPORT_FAILED', `Output directory is invalid: ${outputDirectory}`)
  }

  const srt = serializeSegmentsToSrt(segments)
  const tempPath = `${outputPath}.tmp`

  await fs.writeFile(tempPath, srt, { encoding: 'utf8' })
  try {
    try {
      await fs.rename(tempPath, outputPath)
    } catch {
      await fs.rm(outputPath, { force: true })
      await fs.rename(tempPath, outputPath)
    }
  } catch (error) {
    await fs.rm(tempPath, { force: true })
    if (error instanceof WorkerError) {
      throw error
    }
    if (error instanceof Error) {
      throw new WorkerError('EXPORT_FAILED', error.message)
    }
    throw new WorkerError('EXPORT_FAILED', 'Subtitle export failed unexpectedly.')
  }
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, '0')
}
