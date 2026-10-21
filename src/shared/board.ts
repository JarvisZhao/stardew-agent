// The task board ("委托板"): every session, most urgent first.

import type { Activity, Plot } from './types'

export type BoardGroup = 'needsYou' | 'waiting' | 'working' | 'resting'

export const BOARD_GROUPS: ReadonlyArray<{ id: BoardGroup; title: string }> = [
  { id: 'needsYou', title: '需要你' },
  { id: 'waiting', title: '等你回复' },
  { id: 'working', title: '正在干活' },
  { id: 'resting', title: '休息中' }
]

export function boardGroup(plot: Plot): BoardGroup {
  switch (plot.state) {
    case 'pest':
    case 'withered':
      return 'needsYou'
    case 'thirsty':
      // A question from Claude needs an answer, not just the next instruction.
      return plot.note ? 'needsYou' : 'waiting'
    case 'seeded':
      return 'waiting'
    case 'growing':
      return 'working'
    case 'ripe':
    case 'dormant':
      return 'resting'
  }
}

/** Sessions grouped for the board: longest-waiting first, then most recently active. */
export function sortBoard(plots: readonly Plot[]): Array<{ group: BoardGroup; plots: Plot[] }> {
  return BOARD_GROUPS.map(({ id }) => ({
    group: id,
    plots: plots
      .filter((p) => boardGroup(p) === id)
      .sort((a, b) => (a.waitingSince ?? Infinity) - (b.waitingSince ?? Infinity) || b.updatedAt - a.updatedAt)
  })).filter((g) => g.plots.length > 0)
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  think: '在想',
  edit: '在改代码',
  command: '在跑命令',
  read: '在查资料',
  search: '在搜索文件',
  delegate: '派了帮手'
}

/** Quick replies offered on the board. */
export const QUICK_REPLIES = {
  proceed: '继续',
  status: '请简短汇报一下目前的进度、遇到的问题和下一步计划。'
} as const
