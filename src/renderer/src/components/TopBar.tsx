import type { FarmInfo, FarmSnapshot } from '../../../shared/types'
import { isDemo } from '../api'
import { Sprite } from '../sprite'

interface Props {
  snapshot: FarmSnapshot
  info: FarmInfo | null
  onPlant: () => void
  onNext: (() => void) | null
}

export function TopBar({ snapshot, info, onPlant, onNext }: Props) {
  const count = (...states: string[]): number => snapshot.plots.filter((p) => states.includes(p.state)).length
  const missingClaude = !isDemo && info !== null && info.claudePath === null

  return (
    <header className="topbar">
      <div className="brand">
        <Sprite name="pumpkin" scale={2} />
        <span>Agent 农场</span>
        {isDemo && <span className="tag">演示模式</span>}
      </div>

      <div className="counters">
        <Counter icon={<Sprite name="sprout" scale={2} />} label="生长中" value={count('growing')} />
        <Counter icon={<Sprite name="drop" scale={2} />} label="缺水" value={count('thirsty', 'seeded')} />
        <Counter icon={<Sprite name="bugIcon" scale={2} />} label="有虫" value={count('pest')} />
        <Counter icon={<Sprite name="star" scale={2} />} label="成熟" value={count('ripe')} />
        <Counter icon={<span className="bin-icon" />} label="出货箱" value={snapshot.harvested.length} />
      </div>

      <div className="topbar-actions">
        {missingClaude && <span className="warning">没找到 claude 命令，请先安装 Claude Code</span>}
        <button className="btn" onClick={onNext ?? undefined} disabled={!onNext} title="先处理有虫的地，再处理等得最久的地">
          下一块 ▶
        </button>
        <button className="btn btn-primary" onClick={onPlant}>
          播种
        </button>
      </div>
    </header>
  )
}

function Counter({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <span className={value > 0 ? 'counter' : 'counter zero'} title={label}>
      {icon}
      <span className="counter-label">{label}</span>
      <b>{value}</b>
    </span>
  )
}
