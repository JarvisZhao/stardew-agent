// Pure state transitions for a plot. Everything that changes how a plot looks
// goes through applyEvent so it can be unit tested without processes or Electron.

import type { Plot, PlotState } from './types'

export type PlotEvent =
  /** The agent process was started (fresh or with --resume). */
  | { type: 'spawned'; resumed: boolean }
  /** The agent process exited. `expected` is true when we stopped it ourselves. */
  | { type: 'exited'; exitCode: number; expected: boolean }
  /** A Claude Code hook arrived. `name` is hook_event_name. */
  | { type: 'hook'; name: string; payload: Record<string, unknown> }

const WAITING: ReadonlySet<PlotState> = new Set(['seeded', 'thirsty', 'pest'])

export function isWaiting(state: PlotState): boolean {
  return WAITING.has(state)
}

export function applyEvent(plot: Plot, event: PlotEvent, now: number): Plot {
  const next = reduce(plot, event, now)
  return next === plot ? plot : { ...next, updatedAt: now }
}

function reduce(plot: Plot, event: PlotEvent, now: number): Plot {
  switch (event.type) {
    case 'spawned':
      return enter({ ...plot, running: true, note: null }, event.resumed ? 'thirsty' : 'seeded', now)

    case 'exited': {
      const stopped = { ...plot, running: false }
      if (event.expected) return enter(stopped, 'dormant', now)
      if (event.exitCode === 0) return enter({ ...stopped, note: null }, 'ripe', now)
      return enter({ ...stopped, note: `进程异常退出（代码 ${event.exitCode}）` }, 'withered', now)
    }

    case 'hook':
      return applyHook(plot, event.name, event.payload, now)
  }
}

function applyHook(plot: Plot, name: string, payload: Record<string, unknown>, now: number): Plot {
  let p = plot
  const sessionId = str(payload.session_id)
  if (sessionId && sessionId !== p.sessionId) p = { ...p, sessionId }

  // Hooks fired from inside a subagent (background or not) mean work happened,
  // but they don't tell us whether the main conversation is waiting on the user.
  const fromSubagent = str(payload.agent_id) !== null

  switch (name) {
    case 'UserPromptSubmit':
      return grow(enter({ ...p, note: null }, 'growing', now))

    case 'PostToolUse':
    case 'PostToolUseFailure':
      if (fromSubagent) return grow(p)
      return grow(enter({ ...p, note: null }, 'growing', now))

    case 'SubagentStop':
      return grow(p)

    case 'PermissionRequest': {
      const tool = str(payload.tool_name)
      return enter({ ...p, note: tool ? `等待批准：${tool}` : '等待批准' }, 'pest', now)
    }

    case 'Notification': {
      const type = str(payload.notification_type)
      const message = str(payload.message)
      if (type === 'permission_prompt') return enter({ ...p, note: message ?? p.note }, 'pest', now)
      if (type === 'idle_prompt') return p.state === 'growing' ? enter(p, 'thirsty', now) : p
      if (type === 'elicitation_dialog') return enter({ ...p, note: message ?? '有问题要问你' }, 'thirsty', now)
      return p
    }

    case 'Stop':
      if (fromSubagent) return p
      return enter({ ...p, note: null }, 'thirsty', now)

    case 'StopFailure': {
      const error = str(payload.error) ?? str(payload.message)
      return enter({ ...p, note: error ? `出错：${error}` : 'API 出错' }, 'withered', now)
    }

    default:
      return p
  }
}

/** Move to `state`, keeping the original waiting time if we were already in it. */
function enter(plot: Plot, state: PlotState, now: number): Plot {
  if (plot.state === state) return plot
  return {
    ...plot,
    state,
    waitingSince: isWaiting(state) ? now : null
  }
}

function grow(plot: Plot): Plot {
  return { ...plot, growth: plot.growth + 1 }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// ---------------------------------------------------------------------------
// Derived visuals

export type GrowthStage = 'seed' | 'sprout' | 'young' | 'mature'

/** Crop sprite stage. Only ripe plots show the mature crop. */
export function growthStage(plot: Pick<Plot, 'state' | 'growth'>): GrowthStage {
  if (plot.state === 'ripe') return 'mature'
  if (plot.growth <= 0) return 'seed'
  if (plot.growth < 6) return 'sprout'
  return 'young'
}

export const WILT_MINUTES = [10, 30] as const

/** 0 = fresh, 1 = drooping, 2 = badly wilted. Only waiting plots wilt. */
export function wiltLevel(plot: Pick<Plot, 'state' | 'waitingSince'>, now: number): 0 | 1 | 2 {
  if (!isWaiting(plot.state) || plot.waitingSince === null) return 0
  const minutes = (now - plot.waitingSince) / 60_000
  if (minutes >= WILT_MINUTES[1]) return 2
  if (minutes >= WILT_MINUTES[0]) return 1
  return 0
}

/**
 * The plot the user should tend next: pests first (quick to handle), then the
 * plots that have waited the longest for a reply.
 */
export function nextPlotToTend(plots: readonly Plot[]): Plot | undefined {
  const rank = (p: Plot): number => (p.state === 'pest' ? 0 : 1)
  return plots
    .filter((p) => p.running && isWaiting(p.state))
    .sort((a, b) => rank(a) - rank(b) || (a.waitingSince ?? 0) - (b.waitingSince ?? 0))[0]
}
