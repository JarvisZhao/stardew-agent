import type { Plot } from '../../../shared/types'
import { Sprite } from '../sprite'
import { PlotTile } from './PlotTile'

interface Props {
  plots: Plot[]
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  onPlant: () => void
}

export function Farm({ plots, now, selectedId, onSelect, onPlant }: Props) {
  return (
    <section className="farm">
      <div className="field">
        {plots.length === 0 && (
          <div className="empty-hint">
            <p>农场还空着。</p>
            <p>播种 = 选一个项目目录，开一个 Claude Code 会话。</p>
          </div>
        )}
        <div className="plots">
          {plots.map((plot) => (
            <PlotTile key={plot.id} plot={plot} now={now} selected={plot.id === selectedId} onClick={() => onSelect(plot.id)} />
          ))}
          <button className="plot plot-empty" onClick={onPlant}>
            <div className="soil soil-untilled">
              <span className="plus">+</span>
            </div>
            <div className="sign">
              <span className="sign-name">开垦新地</span>
              <span className="sign-status">开一个新会话</span>
            </div>
          </button>
        </div>
      </div>
      <Legend />
    </section>
  )
}

function Legend() {
  return (
    <footer className="legend">
      <span>
        <Sprite name="drop" scale={2} /> 缺水：等你回复
      </span>
      <span>
        <Sprite name="bugIcon" scale={2} /> 有虫：等你审批
      </span>
      <span>
        <Sprite name="star" scale={2} /> 成熟：会话结束，可以采摘
      </span>
      <span>
        <Sprite name="zzz" scale={2} /> 休眠：点开唤醒
      </span>
      <span>
        <Sprite name="cross" scale={2} /> 枯萎：出错了
      </span>
      <span className="legend-note">等得越久，植物越蔫</span>
    </footer>
  )
}
