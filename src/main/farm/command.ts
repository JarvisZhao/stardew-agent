// Finding the agent executable and turning it into something node-pty can spawn.
// Windows is the tricky part: the native Claude Code installer ships claude.exe,
// while an npm install leaves a claude.cmd shim that must run through cmd.exe.

import path from 'node:path'

export interface ResolvedCommand {
  /** Absolute path of the executable (or of the .cmd shim on Windows). */
  file: string
  /** Arguments placed before the agent arguments (used by tests to run a fake CLI with node). */
  prefixArgs: string[]
}

export interface ResolveEnv {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  homeDir: string
  isFile: (file: string) => boolean
}

/** Look for `name` on PATH, then in the usual install locations. */
export function resolveCommand(name: string, extraCandidates: string[], ctx: ResolveEnv): string | null {
  const win = ctx.platform === 'win32'
  const p = win ? path.win32 : path.posix
  const exts = win ? windowsExtensions(ctx.env) : ['']
  const pathVar = ctx.env.PATH ?? ctx.env.Path ?? ''
  const dirs = pathVar.split(win ? ';' : ':').filter(Boolean)

  // On Windows prefer a real .exe anywhere on PATH over a .cmd shim earlier on PATH.
  const order = win ? ['.exe', ...exts.filter((e) => e !== '.exe')] : exts
  for (const ext of order) {
    for (const dir of dirs) {
      const candidate = p.join(dir.replace(/^"(.*)"$/, '$1'), name + ext)
      if (ctx.isFile(candidate)) return candidate
    }
  }
  for (const candidate of extraCandidates) {
    if (ctx.isFile(candidate)) return candidate
  }
  return null
}

function windowsExtensions(env: Record<string, string | undefined>): string[] {
  const allowed = new Set(['.exe', '.cmd', '.bat', '.com'])
  const fromEnv = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((e) => e.toLowerCase())
    .filter((e) => allowed.has(e))
  return fromEnv.length > 0 ? fromEnv : ['.exe', '.cmd']
}

/** Where Claude Code usually lives when it isn't on PATH (e.g. GUI apps with a short PATH). */
export function claudeCandidates(ctx: ResolveEnv): string[] {
  if (ctx.platform === 'win32') {
    const p = path.win32
    const appData = ctx.env.APPDATA ?? p.join(ctx.homeDir, 'AppData', 'Roaming')
    return [
      p.join(ctx.homeDir, '.local', 'bin', 'claude.exe'),
      p.join(appData, 'npm', 'claude.cmd')
    ]
  }
  const p = path.posix
  return [
    p.join(ctx.homeDir, '.local', 'bin', 'claude'),
    p.join(ctx.homeDir, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]
}

export interface SpawnSpec {
  file: string
  /** A string is passed to node-pty verbatim as the Windows command line. */
  args: string[] | string
}

/** Build the node-pty spawn call, wrapping .cmd/.bat shims with cmd.exe on Windows. */
export function toSpawnSpec(cmd: ResolvedCommand, args: string[], platform: NodeJS.Platform, comspec?: string): SpawnSpec {
  const all = [...cmd.prefixArgs, ...args]
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(cmd.file)) {
    // Same escaping approach as cross-spawn: quote every argument, then caret-escape
    // cmd.exe metacharacters. npm shims forward %* to node, so escape twice.
    const line = [escapeCommand(cmd.file), ...all.map((a) => escapeArgument(a, true))].join(' ')
    return { file: comspec || 'cmd.exe', args: `/d /s /c "${line}"` }
  }
  return { file: cmd.file, args: all }
}

const META = /([()\][%!^"`<>&|;, *?])/g

function escapeCommand(file: string): string {
  return file.replace(META, '^$1')
}

export function escapeArgument(arg: string, doubleEscape: boolean): string {
  let a = arg
  // Backslashes before a quote are doubled and the quote is escaped (MSVCRT rules).
  a = a.replace(/(\\*)"/g, '$1$1\\"')
  // Backslashes at the end are doubled, since we add a closing quote.
  a = a.replace(/(\\*)$/, '$1$1')
  a = `"${a}"`
  a = a.replace(META, '^$1')
  if (doubleEscape) a = a.replace(META, '^$1')
  return a
}
