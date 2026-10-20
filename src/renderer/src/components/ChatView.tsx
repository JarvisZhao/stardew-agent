import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatItem } from '../../../shared/chat'
import { MAX_CHAT_ITEMS } from '../../../shared/chat'
import { mergeChat, type KeyName, type ScreenSnapshot } from '../../../shared/api'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm } from '../api'
import { Sprite } from '../sprite'
import { Markdown } from './Markdown'

/** The plot's conversation, kept in sync with the main process. */
export function useChat(plotId: string): ChatItem[] {
  const [items, setItems] = useState<ChatItem[]>([])
  useEffect(() => {
    let live = true
    const queued: ChatItem[][] = []
    let loaded = false
    const off = farm.onChat((id, changed) => {
      if (id !== plotId) return
      if (!loaded) queued.push(changed)
      else setItems((log) => mergeChat(log, changed, MAX_CHAT_ITEMS))
    })
    void farm.readChat(plotId).then((log) => {
      if (!live) return
      loaded = true
      setItems(queued.splice(0).reduce((acc, changed) => mergeChat(acc, changed, MAX_CHAT_ITEMS), log))
    })
    return () => {
      live = false
      off()
    }
  }, [plotId])
  return items
}

/** Poll what Claude Code shows on its (hidden) screen while the session runs. */
export function useScreen(plotId: string, running: boolean): ScreenSnapshot | null {
  const [screen, setScreen] = useState<ScreenSnapshot | null>(null)
  useEffect(() => {
    if (!running) {
      setScreen(null)
      return
    }
    let live = true
    const poll = (): void => {
      void farm.readScreen(plotId).then((s) => live && setScreen(s), () => {})
    }
    poll()
    const timer = setInterval(poll, 700)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [plotId, running])
  return screen
}

export function ChatView({ plot, items }: { plot: Plot; items: ChatItem[] }) {
  const list = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow new messages unless the user scrolled up to read.
  useLayoutEffect(() => {
    if (pinned.current && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [items, plot.state])

  return (
    <div
      className="chat-list"
      ref={list}
      onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {items.length === 0 && <p className="chat-empty">还没有对话。在下面写下你想让它做的事。</p>}
      {items.map((item) => (
        <ChatRow key={item.id} plot={plot} item={item} />
      ))}
      {plot.running && plot.state === 'growing' && (
        <div className="chat-thinking">
          <Sprite name="sprout" scale={2} /> 正在干活<span className="dots" />
        </div>
      )}
    </div>
  )
}

function ChatRow({ plot, item }: { plot: Plot; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="msg msg-user">
          <div className="bubble-text">{item.text}</div>
        </div>
      )
    case 'assistant':
      return (
        <div className="msg msg-assistant">
          <Sprite name={plot.agent === 'codex' ? 'blueberry' : 'pumpkin'} scale={2} className="avatar" />
          <div className={item.streaming ? 'bubble-text streaming' : 'bubble-text'}>
            <Markdown text={item.text} />
          </div>
        </div>
      )
    case 'tool':
      return <ToolRow item={item} />
    case 'permission':
      return <PermissionCard plot={plot} item={item} />
    case 'question':
      return <QuestionCard plot={plot} item={item} />
    case 'notice':
      return <div className={`chat-notice ${item.tone}`}>{item.text}</div>
  }
}

function ToolRow({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const mark = item.status === 'running' ? <span className="spinner" /> : item.status === 'done' ? '✓' : '✗'
  return (
    <div className={`tool tool-${item.status}`}>
      <button className="tool-head" onClick={() => setOpen(!open)} disabled={!item.output}>
        <span className="tool-mark">{mark}</span>
        <span className="tool-title">{item.title}</span>
        <span className="tool-detail">{item.detail.split('\n')[0]}</span>
        {item.output && <span className="tool-toggle">{open ? '收起' : '结果'}</span>}
      </button>
      {open && item.output && <pre className="tool-output">{item.output}</pre>}
    </div>
  )
}

const PERMISSION_DONE: Record<string, string> = { allowed: '已批准', denied: '已拒绝', resolved: '已处理' }

function PermissionCard({ plot, item }: { plot: Plot; item: Extract<ChatItem, { kind: 'permission' }> }) {
  const [error, setError] = useState<string | null>(null)
  const pending = item.status === 'pending' && plot.running
  const answer = (allow: boolean) => () => {
    setError(null)
    farm.respondPermission(plot.id, item.id, allow).catch((e: unknown) => setError(errorMessage(e)))
  }
  return (
    <div className={pending ? 'card card-permission pending' : 'card card-permission'}>
      <div className="card-head">
        <Sprite name="bugIcon" scale={2} />
        <span>{item.tool === 'ExitPlanMode' ? item.title : `想要${item.title}`}</span>
        {!pending && <span className="card-status">{PERMISSION_DONE[item.status] ?? ''}</span>}
      </div>
      {item.detail && <pre className="card-detail">{item.detail}</pre>}
      {pending && (
        <div className="card-actions">
          <button className="btn btn-primary" onClick={answer(true)}>
            批准
          </button>
          <button className="btn" onClick={answer(false)}>
            拒绝
          </button>
        </div>
      )}
      {error && <div className="note note-error">{error}</div>}
    </div>
  )
}

function QuestionCard({ plot, item }: { plot: Plot; item: Extract<ChatItem, { kind: 'question' }> }) {
  const [error, setError] = useState<string | null>(null)
  const pending = item.status === 'pending' && plot.running
  // With several questions Claude Code shows tabs; leave those to the screen card.
  const single = item.questions.length === 1
  const pick = (label: string) => () => {
    setError(null)
    farm.pickOption(plot.id, label).catch((e: unknown) => setError(errorMessage(e)))
  }
  return (
    <div className={pending ? 'card card-question pending' : 'card card-question'}>
      {item.questions.map((q, qi) => (
        <div key={qi} className="question">
          <div className="card-head">
            <Sprite name="drop" scale={2} />
            <span>{q.question}</span>
            {!pending && qi === 0 && <span className="card-status">{item.status === 'answered' ? '已回答' : '已处理'}</span>}
          </div>
          <div className="card-actions wrap">
            {q.options.map((option, oi) => (
              <button key={oi} className="btn btn-option" disabled={!pending || !single} onClick={pick(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <div className="note note-error">{error}</div>}
    </div>
  )
}

/** Claude Code asks once per folder whether to trust it; its default answer is "No, exit". */
export function TrustCard({ plot }: { plot: Plot }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="screen-card">
      <div className="card-head">
        <Sprite name="drop" scale={2} />
        <span>第一次在这个目录里运行，信任它吗？</span>
      </div>
      <p className="card-text">
        信任后，Claude Code 可以读取、修改和运行 <code>{plot.cwd}</code> 里的文件。只信任你自己的项目或可靠来源的代码。
      </p>
      <div className="card-actions">
        <button className="btn btn-primary" disabled={busy} onClick={run(() => farm.pickOption(plot.id, 'Yes, I trust this folder'))}>
          信任，继续
        </button>
        <button className="btn" disabled={busy} onClick={run(() => farm.stop(plot.id))}>
          不信任
        </button>
      </div>
      {error && <div className="note note-error">{error}</div>}
    </div>
  )
}

const KEYS: Array<[KeyName, string]> = [
  ['up', '↑ 上'],
  ['down', '↓ 下'],
  ['enter', '确定'],
  ['escape', '取消']
]

/**
 * Shown when Claude Code waits on a menu the chat has no card for (trusting a
 * model, …): its current screen as text, plus the few keys such menus need.
 */
export function ScreenCard({ plotId, screen }: { plotId: string; screen: ScreenSnapshot }) {
  return (
    <div className="screen-card">
      <div className="card-head">
        <Sprite name="drop" scale={2} />
        <span>Claude Code 在等你选择</span>
      </div>
      <pre className="screen-text">{screen.text.split('\n').slice(-14).join('\n')}</pre>
      <p className="card-text">「❯」指着的是当前选中的选项，用上下键移动，再按确定。</p>
      <div className="card-actions wrap">
        {KEYS.map(([key, label]) => (
          <button key={key} className="btn btn-key" onClick={() => farm.sendKey(plotId, key)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
