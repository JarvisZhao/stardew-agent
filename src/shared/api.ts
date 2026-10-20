import type { FarmInfo, FarmSnapshot, Plot, PlantRequest } from './types'

/** The API the preload script exposes to the UI as `window.farm`. */
export interface FarmApi {
  getSnapshot(): Promise<FarmSnapshot>
  onSnapshot(listener: (snapshot: FarmSnapshot) => void): () => void
  /** Main process asks the UI to select a plot (e.g. after a notification click). */
  onFocusPlot(listener: (plotId: string) => void): () => void
  info(): Promise<FarmInfo>

  plant(request: PlantRequest): Promise<Plot>
  pickDirectory(): Promise<string | null>
  /** Resume a dormant / ripe / withered plot with `--resume`. */
  revive(plotId: string): Promise<void>
  /** Stop the plot's process; the plot becomes dormant. */
  stop(plotId: string): Promise<void>
  /** Archive the plot to the shipping bin, stopping it first if needed. */
  harvest(plotId: string): Promise<void>

  /** Recent terminal output of the plot, for replay when its terminal opens. */
  readOutput(plotId: string): Promise<OutputChunk>
  /** Live output. `start` is the chunk's offset in the plot's output stream. */
  onOutput(listener: (plotId: string, data: string, start: number) => void): () => void
  write(plotId: string, data: string): void
  resize(plotId: string, cols: number, rows: number): void
}

export interface OutputChunk {
  data: string
  /** Offset in the plot's output stream just after `data`. */
  end: number
}

export const IPC = {
  snapshot: 'farm:snapshot',
  snapshotChanged: 'farm:snapshot-changed',
  focusPlot: 'farm:focus-plot',
  info: 'farm:info',
  plant: 'farm:plant',
  pickDirectory: 'farm:pick-directory',
  revive: 'farm:revive',
  stop: 'farm:stop',
  harvest: 'farm:harvest',
  readOutput: 'farm:read-output',
  output: 'farm:output',
  write: 'farm:write',
  resize: 'farm:resize'
} as const
