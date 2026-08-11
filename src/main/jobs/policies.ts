import path from 'node:path'

export const SUPPORTED_MEDIA_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.wmv'])
export const MAX_CONCURRENT_JOBS = 1

export function computeDefaultOutputPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath)
  const ext = path.extname(sourcePath)
  const basename = path.basename(sourcePath, ext)
  return path.join(dir, `${basename}.ko.srt`)
}

export function hasSupportedMediaExtension(sourcePath: string): boolean {
  return SUPPORTED_MEDIA_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())
}
