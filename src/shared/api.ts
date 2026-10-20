import type { ChatItem } from './chat'
import type { FarmInfo, FarmSnapshot, Plot, PlantRequest } from './types'

/** Keys the chat panel may send to the hidden Claude Code session (e.g. to answer a dialog). */
export const KEY_NAMES = ['enter', 'escape', 'up', 'down', 'left', 'right', 'tab', 'space'] as const
export type KeyName = (typeof KEY_NAMES)[number]

export interface ScreenSnapshot {
  /** Plain text of what Claude Code currently shows, one line per row. */
  text: string
  /** True when the screen looks like a menu or question waiting for a choice. */
  dialog: boolean
  /** A dialog the chat panel has its own card for. */
  known: 'trust' | null
}

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

  readChat(plotId: string): Promise<ChatItem[]>
  /** Chat items that were added or changed (upsert by id, in order). */
  onChat(listener: (plotId: string, items: ChatItem[]) => void): () => void
  sendMessage(plotId: string, text: string): Promise<void>
  respondPermission(plotId: string, itemId: string, allow: boolean): Promise<void>
  /** Move to the menu option starting with `label` and confirm it. */
  pickOption(plotId: string, label: string): Promise<void>
  sendKey(plotId: string, key: KeyName): void
  readScreen(plotId: string): Promise<ScreenSnapshot>
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
  readChat: 'farm:read-chat',
  chat: 'farm:chat',
  sendMessage: 'farm:send-message',
  respondPermission: 'farm:respond-permission',
  pickOption: 'farm:pick-option',
  sendKey: 'farm:send-key',
  readScreen: 'farm:read-screen'
} as const

/** Upsert changed chat items into a log, keeping order and the length cap. */
export function mergeChat(log: readonly ChatItem[], changed: readonly ChatItem[], max: number): ChatItem[] {
  const next = log.slice()
  const index = new Map(next.map((item, i) => [item.id, i]))
  for (const item of changed) {
    const at = index.get(item.id)
    if (at === undefined) {
      index.set(item.id, next.length)
      next.push(item)
    } else {
      next[at] = item
    }
  }
  return next.length > max ? next.slice(next.length - max) : next
}
