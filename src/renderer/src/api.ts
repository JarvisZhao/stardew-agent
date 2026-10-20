import type { FarmApi } from '../../shared/api'
import { createDemoApi } from './demoApi'

/** True when running in a plain browser without the Electron bridge. */
export const isDemo = !window.farm

export const farm: FarmApi = window.farm ?? createDemoApi()

/** Electron wraps errors thrown in the main process; show only our message. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
