// Types shared by the Electron main process, the preload bridge and the UI.

export type AgentKind = 'claude' | 'codex'

/**
 * What a plot looks like on the farm. See docs/DESIGN.md §2.
 * - seeded:   session started, no prompt sent yet
 * - growing:  agent is thinking or running tools
 * - thirsty:  turn finished, waiting for the user's reply
 * - pest:     waiting for a permission decision
 * - withered: something went wrong (API error, crash)
 * - ripe:     the session ended normally, ready to harvest
 * - dormant:  process not running (app restarted / stopped), can be resumed
 */
export type PlotState = 'seeded' | 'growing' | 'thirsty' | 'pest' | 'withered' | 'ripe' | 'dormant'

export interface Plot {
  id: string
  agent: AgentKind
  name: string
  cwd: string
  /** The agent's own session id; used with `--resume`. Can change after `/clear`. */
  sessionId: string
  state: PlotState
  /** Activity counter (prompts + tool calls); drives the crop's growth stage. */
  growth: number
  remoteControl: boolean
  running: boolean
  createdAt: number
  updatedAt: number
  /** When the plot started waiting on the user (seeded / thirsty / pest). */
  waitingSince: number | null
  /** Short detail for the user: the tool awaiting approval, an error, etc. */
  note: string | null
  /** Fixed position in the field, so plots don't move when others are harvested. */
  slot: number
}

export interface HarvestRecord {
  id: string
  name: string
  agent: AgentKind
  cwd: string
  sessionId: string
  plantedAt: number
  harvestedAt: number
  growth: number
}

export interface FarmSnapshot {
  plots: Plot[]
  harvested: HarvestRecord[]
}

export interface PlantRequest {
  name: string
  cwd: string
  agent: AgentKind
  remoteControl: boolean
}

export interface FarmInfo {
  platform: string
  /** Resolved path of the `claude` executable, or null when it can't be found. */
  claudePath: string | null
  version: string
}
