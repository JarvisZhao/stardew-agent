// How we launch Claude Code for a plot. We always run the user's own, unmodified
// `claude` CLI; status comes from HTTP hooks passed with --settings so the user's
// global settings are never touched. See docs/DESIGN.md §8.

export interface ClaudeLaunch {
  sessionId: string
  /** true → `--resume <sessionId>`, false → new session with `--session-id <sessionId>`. */
  resume: boolean
  name: string
  remoteControl: boolean
  settingsPath: string
}

export function buildClaudeArgs(launch: ClaudeLaunch): string[] {
  const args = launch.resume ? ['--resume', launch.sessionId] : ['--session-id', launch.sessionId]
  args.push('--settings', launch.settingsPath)
  if (launch.remoteControl) args.push('--remote-control', sanitizeName(launch.name))
  return args
}

/**
 * Hook events we listen to; see shared/plotMachine.ts (plot state) and
 * shared/chat.ts (chat panel).
 * SessionStart is missing on purpose: it only supports command hooks, not HTTP.
 * Our own process events cover start and resume instead.
 */
export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'MessageDisplay',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStop',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure'
] as const

export const HOOK_ENV = {
  token: 'STARDEW_HOOK_TOKEN',
  plotId: 'STARDEW_PLOT_ID'
} as const

export const PLOT_HEADER = 'x-stardew-plot'

/**
 * Settings file content for `--settings`. The token and plot id are read from the
 * environment of each Claude Code process, so one file serves every plot.
 */
export function buildHookSettings(hookUrl: string): Record<string, unknown> {
  const handler = {
    type: 'http',
    url: hookUrl,
    timeout: 5,
    headers: {
      Authorization: `Bearer $${HOOK_ENV.token}`,
      'X-Stardew-Plot': `$${HOOK_ENV.plotId}`
    },
    allowedEnvVars: [HOOK_ENV.token, HOOK_ENV.plotId]
  }
  return {
    hooks: Object.fromEntries(HOOK_EVENTS.map((event) => [event, [{ hooks: [handler] }]]))
  }
}

/**
 * Plot names end up on the command line (as the Remote Control session title). On
 * Windows a .cmd shim sends them through cmd.exe, so keep only harmless characters.
 */
export function sanitizeName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
  return cleaned || 'plot'
}

/** Remove variables that would make Claude Code think it runs nested inside another session. */
export function childEnv(base: NodeJS.ProcessEnv, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue
    if (key === 'CLAUDECODE' || key === 'CLAUDE_CODE_ENTRYPOINT') continue
    if (key.startsWith('ELECTRON_')) continue
    env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return { ...env, ...extra }
}
