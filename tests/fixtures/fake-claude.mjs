// A stand-in for the `claude` CLI used by the integration tests. It reads the
// --settings file the farm generates, sends hooks the way Claude Code would, and
// reads keystrokes in raw mode like a TUI: bracketed paste, Enter, Esc, arrows.
// With FAKE_TRUST=1 it first asks to trust the folder, defaulting to "No, exit"
// like the real CLI.
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const settings = JSON.parse(fs.readFileSync(flag('--settings'), 'utf8'))
const resumed = flag('--resume')
const sessionId = resumed ?? flag('--session-id')
let turn = 0

// Like the real CLI, only events present in the settings file are sent.
async function hook(name, extra = {}) {
  const handler = settings.hooks[name]?.[0]?.hooks?.[0]
  if (!handler) return
  const headers = { 'content-type': 'application/json' }
  for (const [key, value] of Object.entries(handler.headers ?? {})) {
    headers[key] = value.replace(/\$([A-Z_]+)/g, (_, v) => (handler.allowedEnvVars.includes(v) ? (process.env[v] ?? '') : ''))
  }
  await fetch(handler.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ session_id: sessionId, hook_event_name: name, cwd: process.cwd(), ...extra })
  })
}

const out = (text) => process.stdout.write(text.replace(/\n/g, '\r\n'))
const clear = () => process.stdout.write('\x1b[2J\x1b[H')

/** Keystrokes go to the open menu if there is one, otherwise to the prompt. */
let onKey = null
let line = ''

process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  if (onKey) return onKey(chunk)
  if (chunk === '\r') {
    const prompt = line.trim()
    line = ''
    void submit(prompt)
    return
  }
  line += chunk.replace(/\x1b\[20[01]~/g, '')
})

/** Draw a menu and resolve with the chosen index, or -1 on Esc. */
function menu(title, options, hint = 'Enter to confirm · Esc to cancel') {
  let index = 0
  const draw = () => {
    clear()
    out(`${title}\n\n${options.map((o, i) => `${i === index ? '❯' : ' '} ${o}`).join('\n')}\n\n${hint}\n`)
  }
  draw()
  return new Promise((resolve) => {
    onKey = (key) => {
      if (key === '\x1b[B' || key === '\x1bOB') index = Math.min(options.length - 1, index + 1)
      else if (key === '\x1b[A' || key === '\x1bOA') index = Math.max(0, index - 1)
      else if (key === '\r' || key === '\x1b') {
        onKey = null
        clear()
        out('> ')
        return resolve(key === '\r' ? index : -1)
      }
      draw()
    }
  })
}

async function submit(prompt) {
  if (prompt === '/exit') process.exit(0)
  if (prompt === 'crash') process.exit(3)
  const turnId = `turn-${++turn}`
  await hook('UserPromptSubmit', { prompt, prompt_id: randomUUID() })

  if (prompt === 'hi') {
    await hook('PreToolUse', { tool_name: 'Read', tool_use_id: `${turnId}-read`, tool_input: { file_path: 'README.md' } })
    await hook('PostToolUse', { tool_name: 'Read', tool_use_id: `${turnId}-read`, tool_response: 'readme text' })
    await hook('MessageDisplay', { turn_id: turnId, message_id: 1, index: 0, delta: 'hello from\n', final: false })
    await hook('MessageDisplay', { turn_id: turnId, message_id: 1, index: 1, delta: 'fake claude\n', final: true })
    out('hello from fake claude\n> ')
    await hook('Stop', { last_assistant_message: 'hello from\nfake claude' })
  } else if (prompt === 'perm') {
    await hook('PreToolUse', { tool_name: 'Bash', tool_use_id: `${turnId}-bash`, tool_input: { command: 'npm test' } })
    await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test' } })
    const choice = await menu('Bash(npm test)\nDo you want to proceed?', ['1. Yes', "2. Yes, and don't ask again", '3. No'])
    if (choice === 0 || choice === 1) {
      await hook('PostToolUse', { tool_name: 'Bash', tool_use_id: `${turnId}-bash`, tool_response: { stdout: '35 passed', stderr: '' } })
      await hook('Stop', { last_assistant_message: 'tests passed' })
    } else {
      await hook('Stop', { last_assistant_message: 'ok, not running it' })
    }
  } else if (prompt === 'ask') {
    await hook('PreToolUse', {
      tool_name: 'AskUserQuestion',
      tool_use_id: `${turnId}-ask`,
      tool_input: { questions: [{ question: 'Which one?', options: [{ label: 'A' }, { label: 'B' }] }] }
    })
    const choice = await menu('Which one?', ['1. A', '2. B'])
    await hook('PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: `${turnId}-ask`, tool_response: { choice } })
    await hook('Stop', { last_assistant_message: `you picked ${['A', 'B'][choice] ?? 'nothing'}` })
  } else {
    await hook('Stop', { last_assistant_message: `echo: ${prompt}` })
  }
}

if (process.env.FAKE_TRUST === '1') {
  const choice = await menu('Accessing workspace:\n\nQuick safety check: Is this a project you trust?', ['No, exit', 'Yes, I trust this folder'])
  if (choice !== 1) process.exit(1)
}
out(`\x1b[?2004hfake-claude ${JSON.stringify(args)}\n> `)
