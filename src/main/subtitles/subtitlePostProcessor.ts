import type { Segment } from '@shared/domain'

export function postProcessTranslatedText(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, ' ')
  if (!collapsed) {
    return ''
  }

  const chars = [...collapsed]
  let result = ''

  for (let index = 0; index < chars.length; index += 1) {
    const current = chars[index]
    const previous = index > 0 ? chars[index - 1] : ''
    const next = index + 1 < chars.length ? chars[index + 1] : ''

    result += current

    if (!next || /\s/.test(next)) {
      continue
    }

    if (current === '.' || current === '?' || current === '!') {
      if (current === '.' && /\d/.test(previous) && /\d/.test(next)) {
        continue
      }
      result += ' '
    }
  }

  return result
}

export function postProcessTranslatedSegments(
  segments: Segment[],
): Array<{ sequence: number; translatedText: string }> {
  return segments
    .filter((segment) => segment.translatedText !== null)
    .map((segment) => ({
      sequence: segment.sequence,
      translatedText: postProcessTranslatedText(segment.translatedText ?? ''),
    }))
}
