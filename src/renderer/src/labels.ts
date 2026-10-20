import { isWaiting } from '../../shared/plotMachine'
import type { AgentKind, Plot, PlotState } from '../../shared/types'

export const STATE_LABEL: Record<PlotState, string> = {
  seeded: '刚播种',
  growing: '生长中',
  thirsty: '缺水',
  pest: '有虫',
  withered: '枯萎',
  ripe: '成熟',
  dormant: '休眠'
}

const STATE_HINT: Record<PlotState, string> = {
  seeded: '等第一桶水',
  growing: '正在干活',
  thirsty: '等你回复',
  pest: '等你审批',
  withered: '出错了',
  ripe: '可以采摘',
  dormant: '点开唤醒'
}

export const AGENT_LABEL: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex'
}

export function waitedFor(plot: Plot, now: number): string | null {
  if (!isWaiting(plot.state) || plot.waitingSince === null) return null
  const minutes = Math.floor((now - plot.waitingSince) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}`
}

export function statusLine(plot: Plot, now: number): string {
  const waited = waitedFor(plot, now)
  return waited ? `${STATE_HINT[plot.state]} · ${waited}` : STATE_HINT[plot.state]
}
