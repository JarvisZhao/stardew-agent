// Farm persistence: a small JSON file in the app's data directory.

import fs from 'node:fs'
import path from 'node:path'
import type { ChatItem } from '../../shared/chat'
import type { FarmSnapshot, HarvestRecord, Plot } from '../../shared/types'

const FILE = 'farm.json'
const VERSION = 1

interface StoredFarm {
  version: number
  plots: Plot[]
  harvested: HarvestRecord[]
}

export function loadFarm(dataDir: string): FarmSnapshot {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8')) as Partial<StoredFarm>
    if (raw.version !== VERSION) return { plots: [], harvested: [] }
    const plots = Array.isArray(raw.plots) ? raw.plots : []
    // Farms saved before plots had slots: keep their order.
    plots.forEach((p, i) => {
      if (typeof p.slot !== 'number') p.slot = i
    })
    return {
      plots,
      harvested: Array.isArray(raw.harvested) ? raw.harvested : []
    }
  } catch {
    return { plots: [], harvested: [] }
  }
}

export function saveFarm(dataDir: string, farm: FarmSnapshot): void {
  fs.mkdirSync(dataDir, { recursive: true })
  const target = path.join(dataDir, FILE)
  const tmp = `${target}.tmp`
  const data: StoredFarm = { version: VERSION, plots: farm.plots, harvested: farm.harvested }
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, target)
}

// Chat logs live next to farm.json, one file per plot.

function chatFile(dataDir: string, plotId: string): string {
  return path.join(dataDir, 'chats', `${plotId}.json`)
}

export function loadChat(dataDir: string, plotId: string): ChatItem[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(chatFile(dataDir, plotId), 'utf8'))
    return Array.isArray(raw) ? (raw as ChatItem[]) : []
  } catch {
    return []
  }
}

export function saveChat(dataDir: string, plotId: string, items: readonly ChatItem[]): void {
  const target = chatFile(dataDir, plotId)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(items))
  fs.renameSync(`${target}.tmp`, target)
}
