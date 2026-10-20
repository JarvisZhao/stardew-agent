// A stand-in for the `claude` CLI used by the integration tests. It reads the
// --settings file the farm generates and sends hooks the way Claude Code would.
import fs from 'node:fs'
import readline from 'node:readline'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const settings = JSON.parse(fs.readFileSync(flag('--settings'), 'utf8'))
const resumed = flag('--resume')
const sessionId = resumed ?? flag('--session-id')

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

process.stdout.write(`fake-claude ${JSON.stringify(args)}\r\n`)
await hook('SessionStart', { source: resumed ? 'resume' : 'startup' })

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  const command = line.trim()
  if (command === 'hi') {
    await hook('UserPromptSubmit', { prompt: 'hi' })
    await hook('PostToolUse', { tool_name: 'Read' })
    process.stdout.write('hello from fake claude\r\n')
    await hook('Stop')
  } else if (command === 'perm') {
    await hook('PermissionRequest', { tool_name: 'Bash' })
  } else if (command === '/exit') {
    process.exit(0)
  } else if (command === 'crash') {
    process.exit(3)
  }
})
