import { useState } from 'react'
import { ACTIVITY_LABEL, BOARD_GROUPS, QUICK_REPLIES, sortBoard, type BoardGroup } from '../../../shared/board'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm } from '../api'
import { AGENT_LABEL, STATE_LABEL, waitedFor } from '../labels'
import { junimoColour } from '../world/junimos'
import * as sprites from '../world/sprites'

const avatars = new Map<string, string>()

/** The session's Junimo, as a little avatar. */
export function JunimoAvatar({ plotId, size = 28 }: { plotId: string; size?: number }) {
  const colour = junimoColour(plotId)
  let url = avatars.get(colour)
  if (!url) {
    url = sprites.junimo(colour, 0).image.toDataURL()
    avatars.set(colour, url)
  }
  return <img className="junimo-avatar" src={url} width={size} height={Math.round((size * 15) / 14)} alt="" draggable={false} />
}

interface Props {
  plots: Plot[]
  now: number
  onOpen: (plotId: string) => void
  onPlant: () => void
}

const GROUP_TITLE = Object.fromEntries(BOARD_GROUPS.map((g) => [g.id, g.title])) as Record<BoardGroup, string>

export function TaskBoard({ plots, now, onOpen, onPlant }: Props) {
  const groups = sortBoard(plots)
  return (
    <div className="board">
      <header className="board-head">
        <h2>委托板</h2>
        <span className="muted">{plots.length} 个会话</span>
        <button className="btn btn-primary btn-small" onClick={onPlant}>
          新会话
        </button>
      </header>
      <div className="board-list">
        {groups.length === 0 && <p className="chat-empty">还没有会话。点「新会话」种下第一块地。</p>}
        {groups.map(({ group, plots: members }) => (
          <section key={group} className={`board-group group-${group}`}>
            <h3>
              {GROUP_TITLE[group]} <b>{members.length}</b>
            </h3>
            {members.map((plot) => (
              <QuestCard key={plot.id} plot={plot} group={group} now={now} onOpen={() => onOpen(plot.id)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function QuestCard({ plot, group, now, onOpen }: { plot: Plot; group: BoardGroup; now: number; onOpen: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<void> | void) => async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const waited = waitedFor(plot, now)
  const doing = plot.state === 'growing' && plot.activity ? ACTIVITY_LABEL[plot.activity] : null
  const status = [STATE_LABEL[plot.state], doing, waited].filter(Boolean).join(' · ')
  const canReply = plot.running && (plot.state === 'thirsty' || plot.state === 'seeded') && !plot.note

  return (
    <article className={`quest group-${group}`} onClick={onOpen} title="打开对话">
      <div className="quest-top">
        <JunimoAvatar plotId={plot.id} />
        <div className="quest-title">
          <strong>{plot.name}</strong>
          <span className="muted">{AGENT_LABEL[plot.agent]}</span>
        </div>
        <span className={`badge badge-small state-${plot.state}`}>{status}</span>
      </div>
      {plot.note && <p className="quest-note">{plot.note}</p>}
      {plot.summary && <p className="quest-summary">{plot.summary}</p>}
      {plot.lastPrompt && (
        <p className="quest-prompt">
          <span>你：</span>
          {plot.lastPrompt}
        </p>
      )}
      <div className="quest-actions">
        <button className="btn btn-small btn-primary" onClick={(e) => (e.stopPropagation(), onOpen())}>
          {group === 'needsYou' ? '去处理' : '打开对话'}
        </button>
        {canReply && (
          <>
            <button className="btn btn-small" disabled={busy} onClick={run(() => farm.sendMessage(plot.id, QUICK_REPLIES.proceed))}>
              继续
            </button>
            <button className="btn btn-small" disabled={busy} onClick={run(() => farm.sendMessage(plot.id, QUICK_REPLIES.status))}>
              汇报进度
            </button>
          </>
        )}
        {plot.running && plot.state === 'growing' && (
          <button className="btn btn-small" disabled={busy} title="让它停下手头的事，等你的新指示" onClick={run(() => farm.sendKey(plot.id, 'escape'))}>
            打断
          </button>
        )}
        {!plot.running && (
          <button className="btn btn-small" disabled={busy} onClick={run(() => farm.revive(plot.id))}>
            {plot.state === 'ripe' ? '再种一季' : '唤醒'}
          </button>
        )}
        {plot.state === 'ripe' && (
          <button className="btn btn-small" disabled={busy} onClick={run(() => farm.harvest(plot.id))}>
            采摘
          </button>
        )}
      </div>
      {error && <div className="note note-error">{error}</div>}
    </article>
  )
}
