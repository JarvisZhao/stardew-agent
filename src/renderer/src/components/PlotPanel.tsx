import { useState } from 'react'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm } from '../api'
import { AGENT_LABEL, STATE_LABEL, waitedFor } from '../labels'
import { ChatView, ScreenCard, TrustCard, useChat, useScreen } from './ChatView'
import { Composer } from './Composer'
import { JunimoAvatar } from './TaskBoard'

interface Props {
  plot: Plot
  now: number
  onClose: () => void
}

export function PlotPanel({ plot, now, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const items = useChat(plot.id)
  const screen = useScreen(plot.id, plot.running)

  const act = (action: () => Promise<void>) => async () => {
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
  const waited = waitedFor(plot, now)
  // Permission and question cards already cover their dialogs.
  const covered = items.some((i) => (i.kind === 'permission' || i.kind === 'question') && i.status === 'pending')
  const trust = plot.running && screen?.known === 'trust'
  const showScreen = plot.running && screen?.dialog === true && !trust && !covered

  return (
    <aside className="panel">
      <header className="panel-head">
        <button className="btn btn-small" onClick={onClose} title="回到委托板，看所有会话">
          ← 委托板
        </button>
        <JunimoAvatar plotId={plot.id} />
        <div className="panel-title">
          <h2>{plot.name}</h2>
          <p className="muted" title={plot.cwd}>
            {AGENT_LABEL[plot.agent]} · {plot.cwd}
          </p>
        </div>
        <span className={`badge state-${plot.state}`}>
          {STATE_LABEL[plot.state]}
          {waited && ` · ${waited}`}
        </span>
        {plot.remoteControl && (
          <span className="rc-tag" title="claude.ai/code 和手机 Claude app 可以同步查看和回复">
            同步中
          </span>
        )}
        {plot.running && (
          <button className="btn btn-small" disabled={busy} onClick={act(() => farm.stop(plot.id))} title="结束进程，之后可以唤醒接着聊">
            休眠
          </button>
        )}

      </header>

      {/* Waiting states have their own cards in the chat; only errors need the banner. */}
      {plot.note && plot.state === 'withered' && <div className="note note-error">{plot.note}</div>}
      {error && <div className="note note-error">{error}</div>}

      <div className="chat">
        <ChatView plot={plot} items={items} />
        {trust && <TrustCard plot={plot} />}
        {showScreen && <ScreenCard plotId={plot.id} screen={screen} />}
        {plot.running ? (
          <Composer plot={plot} />
        ) : (
          <div className="revive-bar">
            <span>{plot.state === 'ripe' ? '会话已结束。' : '会话没在运行。'}</span>
            <button className="btn btn-primary" disabled={busy} onClick={act(() => farm.revive(plot.id))} title="接着这次对话继续">
              {plot.state === 'ripe' ? '再种一季' : '唤醒'}
            </button>
            <button className="btn" disabled={busy} onClick={act(() => farm.harvest(plot.id))} title="移出农场，记入出货箱">
              {plot.state === 'ripe' ? '采摘入箱' : '铲除（归档）'}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
