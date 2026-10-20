import { useState } from 'react'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm } from '../api'
import { AGENT_LABEL, STATE_LABEL, waitedFor } from '../labels'
import { TerminalView } from './TerminalView'

interface Props {
  plot: Plot
  now: number
  onClose: () => void
}

export function PlotPanel({ plot, now, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <aside className="panel">
      <header className="panel-head">
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
        <button className="btn btn-icon" onClick={onClose} title="收起">
          ✕
        </button>
      </header>

      {plot.note && <div className="note">{plot.note}</div>}
      {error && <div className="note note-error">{error}</div>}

      <div className="panel-actions">
        {plot.running ? (
          <button className="btn" disabled={busy} onClick={act(() => farm.stop(plot.id))} title="结束进程，之后可以唤醒继续">
            让它休眠
          </button>
        ) : (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={act(() => farm.revive(plot.id))} title="用 --resume 接着这次对话">
              {plot.state === 'ripe' ? '再种一季' : '唤醒'}
            </button>
            <button className="btn" disabled={busy} onClick={act(() => farm.harvest(plot.id))} title="移出农场，记入出货箱">
              {plot.state === 'ripe' ? '采摘入箱' : '铲除（归档）'}
            </button>
          </>
        )}
        {plot.remoteControl && <span className="rc-tag" title="Claude app 网页版和手机 app 可以同步查看和回复">Remote Control</span>}
        <span className="muted session-id" title="Claude Code 会话 ID">
          {plot.sessionId.slice(0, 8)}
        </span>
      </div>

      <div className="terminal-wrap">
        <TerminalView plotId={plot.id} />
        {!plot.running && (
          <div className="terminal-overlay">
            {plot.state === 'ripe' ? '会话已结束。可以采摘，也可以「再种一季」接着聊。' : '会话没在运行。点「唤醒」接着上次的对话。'}
          </div>
        )}
      </div>
    </aside>
  )
}
