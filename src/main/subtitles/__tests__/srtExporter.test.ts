import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Segment } from '@shared/domain'
import { exportSegmentsToSrt, formatSrtTimestamp, serializeSegmentsToSrt } from '../srtExporter'

let tempDir = ''

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  tempDir = ''
})

function makeSegment(input: {
  sequence: number
  startMs: number
  endMs: number
  translatedText: string
}): Segment {
  const now = new Date().toISOString()
  return {
    id: `segment-${input.sequence}`,
    jobId: 'job-1',
    sequence: input.sequence,
    startMs: input.startMs,
    endMs: input.endMs,
    sourceText: 'source',
    translatedText: input.translatedText,
    createdAt: now,
    updatedAt: now,
  }
}

describe('srtExporter', () => {
  it('formats milliseconds to SRT timestamp', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000')
    expect(formatSrtTimestamp(1)).toBe('00:00:00,001')
    expect(formatSrtTimestamp(999)).toBe('00:00:00,999')
    expect(formatSrtTimestamp(1000)).toBe('00:00:01,000')
    expect(formatSrtTimestamp(61000)).toBe('00:01:01,000')
    expect(formatSrtTimestamp(3661001)).toBe('01:01:01,001')
  })

  it('serializes segments to standard SRT blocks with blank lines', () => {
    const text = serializeSegmentsToSrt([
      makeSegment({ sequence: 0, startMs: 610, endMs: 3590, translatedText: '안녕하세요. 오늘은 조금 일찍 일어났어요.' }),
      makeSegment({ sequence: 1, startMs: 8410, endMs: 10430, translatedText: '오전에는 집에서 일을 하고 있었어요.' }),
    ])

    expect(text).toBe(
      '1\n' +
        '00:00:00,610 --> 00:00:03,590\n' +
        '안녕하세요. 오늘은 조금 일찍 일어났어요.\n\n' +
        '2\n' +
        '00:00:08,410 --> 00:00:10,430\n' +
        '오전에는 집에서 일을 하고 있었어요.\n\n',
    )
  })

  it('writes utf-8 SRT file to output path', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subforge-export-'))
    const outputPath = path.join(tempDir, 'output.ko.srt')

    await exportSegmentsToSrt(outputPath, [
      makeSegment({ sequence: 0, startMs: 0, endMs: 1000, translatedText: '첫 번째 줄' }),
      makeSegment({ sequence: 1, startMs: 1000, endMs: 2500, translatedText: '두 번째 줄' }),
    ])

    expect(fs.existsSync(outputPath)).toBe(true)
    const content = fs.readFileSync(outputPath, 'utf8')
    expect(content.startsWith('1\n00:00:00,000 --> 00:00:01,000\n첫 번째 줄\n\n')).toBe(true)
    expect(content.includes('\n2\n00:00:01,000 --> 00:00:02,500\n두 번째 줄\n\n')).toBe(true)
  })
})
