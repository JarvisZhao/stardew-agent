import { describe, expect, it } from 'vitest'
import { claudeCandidates, escapeArgument, resolveCommand, toSpawnSpec, type ResolveEnv } from './command'

function ctx(platform: NodeJS.Platform, files: string[], env: Record<string, string>): ResolveEnv {
  const set = new Set(files)
  return { platform, env, homeDir: platform === 'win32' ? 'C:\\Users\\me' : '/home/me', isFile: (f) => set.has(f) }
}

describe('resolveCommand', () => {
  it('finds claude on PATH on macOS / Linux', () => {
    const c = ctx('linux', ['/usr/bin/claude'], { PATH: '/bin:/usr/bin' })
    expect(resolveCommand('claude', claudeCandidates(c), c)).toBe('/usr/bin/claude')
  })

  it('prefers claude.exe over an npm claude.cmd shim on Windows', () => {
    const c = ctx('win32', ['C:\\npm\\claude.cmd', 'C:\\Users\\me\\.local\\bin\\claude.exe'], {
      Path: 'C:\\npm;C:\\Users\\me\\.local\\bin',
      PATHEXT: '.COM;.EXE;.BAT;.CMD;.PS1'
    })
    expect(resolveCommand('claude', claudeCandidates(c), c)).toBe('C:\\Users\\me\\.local\\bin\\claude.exe')
  })

  it('falls back to the npm shim and the usual install locations', () => {
    const shim = ctx('win32', ['C:\\npm\\claude.cmd'], { Path: 'C:\\npm' })
    expect(resolveCommand('claude', claudeCandidates(shim), shim)).toBe('C:\\npm\\claude.cmd')

    const notOnPath = ctx('win32', ['C:\\Users\\me\\.local\\bin\\claude.exe'], { Path: 'C:\\Windows' })
    expect(resolveCommand('claude', claudeCandidates(notOnPath), notOnPath)).toBe('C:\\Users\\me\\.local\\bin\\claude.exe')

    const missing = ctx('darwin', [], { PATH: '/usr/bin' })
    expect(resolveCommand('claude', claudeCandidates(missing), missing)).toBeNull()
  })
})

describe('toSpawnSpec', () => {
  it('spawns executables directly', () => {
    expect(toSpawnSpec({ file: 'C:\\bin\\claude.exe', prefixArgs: [] }, ['--resume', 'abc'], 'win32')).toEqual({
      file: 'C:\\bin\\claude.exe',
      args: ['--resume', 'abc']
    })
  })

  it('wraps .cmd shims with cmd.exe and escapes metacharacters', () => {
    const spec = toSpawnSpec({ file: 'C:\\npm\\claude.cmd', prefixArgs: [] }, ['--remote-control', 'a & b'], 'win32', 'C:\\Windows\\cmd.exe')
    expect(spec.file).toBe('C:\\Windows\\cmd.exe')
    expect(typeof spec.args).toBe('string')
    // The ampersand must never reach cmd.exe unescaped.
    expect(spec.args).not.toMatch(/[^^]&/)
    expect(spec.args).toMatch(/^\/d \/s \/c "/)
  })

  it('escapes quotes and trailing backslashes the MSVCRT way', () => {
    expect(escapeArgument('C:\\dir\\', false)).toBe('^"C:\\dir\\\\^"')
    expect(escapeArgument('say "hi"', false)).toBe('^"say^ \\^"hi\\^"^"')
  })
})
