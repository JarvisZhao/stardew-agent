// Farm persistence: a small JSON file in the app's data directory.

import fs from 'node:fs'
import path from 'node:path'
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
    return {
      plots: Array.isArray(raw.plots) ? raw.plots : [],
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
