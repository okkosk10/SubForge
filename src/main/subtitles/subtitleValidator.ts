import type { Segment } from '@shared/domain'

export interface ValidationIssue {
  code: string
  sequence?: number
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export function validateSegmentsForSrt(segments: Segment[]): ValidationResult {
  const issues: ValidationIssue[] = []

  if (segments.length === 0) {
    issues.push({
      code: 'EMPTY_SEGMENTS',
      message: 'No segments available for subtitle export.',
    })
  }

  const orderedBySequence = [...segments].sort((a, b) => a.sequence - b.sequence)
  const sequenceSet = new Set<number>()
  let previousStart: number | null = null

  for (const segment of orderedBySequence) {
    if (!Number.isInteger(segment.sequence) || segment.sequence < 0) {
      issues.push({
        code: 'INVALID_SEQUENCE',
        sequence: segment.sequence,
        message: `Segment sequence is invalid: ${segment.sequence}.`,
      })
    }

    if (sequenceSet.has(segment.sequence)) {
      issues.push({
        code: 'DUPLICATE_SEQUENCE',
        sequence: segment.sequence,
        message: `Duplicate segment sequence found: ${segment.sequence}.`,
      })
    }
    sequenceSet.add(segment.sequence)

    if (segment.startMs < 0) {
      issues.push({
        code: 'INVALID_TIMESTAMP',
        sequence: segment.sequence,
        message: `Segment ${segment.sequence} has negative start timestamp.`,
      })
    }

    if (segment.endMs <= segment.startMs) {
      issues.push({
        code: 'INVALID_TIMESTAMP',
        sequence: segment.sequence,
        message: `Segment ${segment.sequence} has non-positive duration.`,
      })
    }

    if (previousStart !== null && segment.startMs < previousStart) {
      issues.push({
        code: 'NON_MONOTONIC_START',
        sequence: segment.sequence,
        message: `Segment ${segment.sequence} start timestamp is out of order.`,
      })
    }
    previousStart = segment.startMs

    if (!segment.translatedText || !segment.translatedText.trim()) {
      issues.push({
        code: 'MISSING_TRANSLATION',
        sequence: segment.sequence,
        message: `Segment ${segment.sequence} has no translated text.`,
      })
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}
