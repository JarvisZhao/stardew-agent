import { describe, expect, it } from 'vitest'
import { buildClaudeArgs, buildHookSettings, childEnv, HOOK_EVENTS, sanitizeName } from './claude'

describe('buildClaudeArgs', () => {
  it('starts a new session with a fixed id and our hook settings', () => {
    expect(buildClaudeArgs({ sessionId: 'u1', resume: false, name: '重构 登录', remoteControl: true, settingsPath: '/d/h.json' })).toEqual([
      '--session-id',
      'u1',
      '--settings',
      '/d/h.json',
      '--remote-control',
      '重构 登录'
    ])
  })

  it('resumes without Remote Control when it is off', () => {
    expect(buildClaudeArgs({ sessionId: 'u1', resume: true, name: 'x', remoteControl: false, settingsPath: 's' })).toEqual([
      '--resume',
      'u1',
      '--settings',
      's'
    ])
  })
})

describe('buildHookSettings', () => {
  it('registers one HTTP hook per event with env-based auth', () => {
    const settings = buildHookSettings('http://127.0.0.1:1234/hook') as { hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>> }
    expect(Object.keys(settings.hooks)).toEqual([...HOOK_EVENTS])
    const handler = settings.hooks.Stop[0].hooks[0]
    expect(handler).toMatchObject({
      type: 'http',
      url: 'http://127.0.0.1:1234/hook',
      headers: { Authorization: 'Bearer $STARDEW_HOOK_TOKEN', 'X-Stardew-Plot': '$STARDEW_PLOT_ID' },
      allowedEnvVars: ['STARDEW_HOOK_TOKEN', 'STARDEW_PLOT_ID']
    })
  })
})

describe('sanitizeName', () => {
  it('keeps letters, digits and simple punctuation', () => {
    expect(sanitizeName('修复 CI-pipeline_v2.1')).toBe('修复 CI-pipeline_v2.1')
  })

  it('drops shell metacharacters', () => {
    expect(sanitizeName('a & b | "c" %PATH% ^!')).toBe('a b c PATH')
    expect(sanitizeName('&&&')).toBe('plot')
  })
})

describe('childEnv', () => {
  it('removes nested-session markers and adds the plot variables', () => {
    const env = childEnv({ PATH: '/bin', CLAUDECODE: '1', ELECTRON_RUN_AS_NODE: '1' }, { STARDEW_PLOT_ID: 'p' })
    expect(env).toMatchObject({ PATH: '/bin', STARDEW_PLOT_ID: 'p', TERM: 'xterm-256color' })
    expect(env).not.toHaveProperty('CLAUDECODE')
    expect(env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
  })
})
