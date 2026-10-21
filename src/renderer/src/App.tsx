import { useEffect, useState } from 'react'
import { nextPlotToTend } from '../../shared/plotMachine'
import type { FarmInfo, FarmSnapshot } from '../../shared/types'
import { farm } from './api'
import { PlantDialog } from './components/PlantDialog'
import { PlotPanel } from './components/PlotPanel'
import { TaskBoard } from './components/TaskBoard'
import { TopBar } from './components/TopBar'
import { FarmWorld } from './world/FarmWorld'

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function App() {
  const [snapshot, setSnapshot] = useState<FarmSnapshot>({ plots: [], harvested: [] })
  const [info, setInfo] = useState<FarmInfo | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [planting, setPlanting] = useState(false)
  const now = useNow(15_000)

  useEffect(() => {
    void farm.getSnapshot().then(setSnapshot)
    void farm.info().then(setInfo)
    const offSnapshot = farm.onSnapshot(setSnapshot)
    const offFocus = farm.onFocusPlot(setSelectedId)
    return () => {
      offSnapshot()
      offFocus()
    }
  }, [])

  const selected = snapshot.plots.find((p) => p.id === selectedId) ?? null
  const next = nextPlotToTend(snapshot.plots)

  return (
    <div className="app">
      <TopBar
        snapshot={snapshot}
        info={info}
        onPlant={() => setPlanting(true)}
        onNext={next ? () => setSelectedId(next.id) : null}
      />
      <main className="layout">
        <FarmWorld
          plots={snapshot.plots}
          harvestedCount={snapshot.harvested.length}
          now={now}
          selectedId={selected?.id ?? null}
          onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
          onPlant={() => setPlanting(true)}
        />
        {selected ? (
          <PlotPanel key={selected.id} plot={selected} now={now} onClose={() => setSelectedId(null)} />
        ) : (
          <aside className="panel">
            <TaskBoard plots={snapshot.plots} now={now} onOpen={setSelectedId} onPlant={() => setPlanting(true)} />
          </aside>
        )}
      </main>
      {planting && (
        <PlantDialog
          onClose={() => setPlanting(false)}
          onPlanted={(plot) => {
            setPlanting(false)
            setSelectedId(plot.id)
          }}
        />
      )}
    </div>
  )
}
