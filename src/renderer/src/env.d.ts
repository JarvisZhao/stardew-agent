import type { FarmApi } from '../../shared/api'

declare global {
  interface Window {
    /** Provided by the Electron preload script; missing in a plain browser (demo mode). */
    farm?: FarmApi
  }
}

export {}
