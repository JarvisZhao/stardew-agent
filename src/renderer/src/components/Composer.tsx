import { useRef, useState } from 'react'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm } from '../api'

export function Composer({ plot }: { plot: Plot }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  const send = async (): Promise<void> => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    setError(null)
    try {
      await farm.sendMessage(plot.id, message)
      setText('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  const placeholder = plot.state === 'seeded' ? '浇第一桶水：说说你想让它做什么' : '回复…（Enter 发送，Shift+Enter 换行）'

  return (
    <div className="composer">
      {error && <div className="note note-error">{error}</div>}
      <div className="composer-row">
        <textarea
          ref={input}
          value={text}
          rows={Math.min(8, Math.max(2, text.split('\n').length))}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Don't send while an input method (e.g. Chinese pinyin) is composing.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          autoFocus
        />
        <div className="composer-buttons">
          <button className="btn btn-primary" onClick={() => void send()} disabled={!text.trim() || sending}>
            发送
          </button>
          {plot.state === 'growing' && (
            <button className="btn" onClick={() => farm.sendKey(plot.id, 'escape')} title="让它停下手头的事，等你的新指示">
              打断
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
