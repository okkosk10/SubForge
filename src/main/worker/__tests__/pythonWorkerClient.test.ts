import { describe, expect, it } from 'vitest'
import { buildPythonEnv } from '../pythonWorkerClient'

describe('python worker environment', () => {
  it('forces UTF-8 output handling for Windows environments', () => {
    const env = buildPythonEnv()

    expect(env.PYTHONUTF8).toBe('1')
    expect(env.PYTHONIOENCODING).toBe('utf-8')
    expect(env.LANG).toBe('C.UTF-8')
    expect(env.LC_ALL).toBe('C.UTF-8')
  })
})
