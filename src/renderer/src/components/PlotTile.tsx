import { growthStage, wiltLevel } from '../../../shared/plotMachine'
import { SOIL_DRY, SOIL_WET, type SpriteName } from '../../../shared/sprites'
import type { Plot, PlotState } from '../../../shared/types'
import { AGENT_LABEL, statusLine } from '../labels'
import { Sprite, spriteUrl } from '../sprite'

const BUBBLE: Record<PlotState, SpriteName | null> = {
  seeded: 'drop',
  growing: null,
  thirsty: 'drop',
  pest: 'bugIcon',
  withered: 'cross',
  ripe: 'star',
  dormant: 'zzz'
}

function cropSprite(plot: Plot): SpriteName {
  if (plot.state === 'withered') return 'withered'
  const stage = growthStage(plot)
  if (stage === 'mature') return plot.agent === 'codex' ? 'blueberry' : 'pumpkin'
  return stage
}

interface Props {
  plot: Plot
  now: number
  selected: boolean
  onClick: () => void
}

export function PlotTile({ plot, now, selected, onClick }: Props) {
  const wilt = wiltLevel(plot, now)
  const bubble = BUBBLE[plot.state]
  const soil = spriteUrl('soil', plot.state === 'growing' ? SOIL_WET : SOIL_DRY)
  const classes = ['plot', `state-${plot.state}`, `wilt-${wilt}`, selected ? 'selected' : ''].join(' ')

  return (
    <button className={classes} onClick={onClick} title={`${plot.name}\n${plot.cwd}`}>
      <div className="soil" style={{ backgroundImage: `url(${soil})` }}>
        <Sprite name={cropSprite(plot)} scale={6} className="crop" />
        {plot.state === 'pest' && <Sprite name="bug" scale={3} className="bug" />}
        {plot.state === 'ripe' && <span className="sparkle" />}
        <span className={`agent-tag agent-${plot.agent}`}>{AGENT_LABEL[plot.agent]}</span>
      </div>
      {bubble && (
        <span className="bubble">
          <Sprite name={bubble} scale={3} />
        </span>
      )}
      <div className="sign">
        <span className="sign-name">{plot.name}</span>
        <span className="sign-status">{statusLine(plot, now)}</span>
      </div>
    </button>
  )
}
