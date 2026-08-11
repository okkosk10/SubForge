import type { SubForgeApi } from './shared/ipc'

declare global {
  interface Window {
    subForge: SubForgeApi
  }
}

export {}
