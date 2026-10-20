import { useState } from 'react'
import type { Plot } from '../../../shared/types'
import { errorMessage, farm, isDemo } from '../api'
import { Sprite } from '../sprite'

interface Props {
  onClose: () => void
  onPlanted: (plot: Plot) => void
}

export function PlantDialog({ onClose, onPlanted }: Props) {
  const [name, setName] = useState('')
  const [cwd, setCwd] = useState('')
  const [remoteControl, setRemoteControl] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (): Promise<void> => {
    const dir = await farm.pickDirectory()
    if (!dir) return
    setCwd(dir)
    if (!name.trim()) setName(dir.split(/[\\/]/).filter(Boolean).pop() ?? '')
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onPlanted(await farm.plant({ name, cwd, agent: 'claude', remoteControl }))
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>
          <Sprite name="sprout" scale={2} /> 播种
        </h2>

        <label className="field-row">
          <span>项目目录</span>
          <div className="input-group">
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder={isDemo ? '演示模式可以随便填' : '选择或粘贴一个目录'} />
            {!isDemo && (
              <button type="button" className="btn" onClick={() => void pick()}>
                选择…
              </button>
            )}
          </div>
        </label>

        <label className="field-row">
          <span>地块名字</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：重构登录模块" maxLength={60} autoFocus />
        </label>

        <fieldset className="field-row">
          <span>种什么</span>
          <div className="seed-options">
            <label className="seed-option selected">
              <input type="radio" name="agent" defaultChecked />
              <Sprite name="pumpkin" scale={2} /> Claude Code
            </label>
            <label className="seed-option disabled" title="下一步就做">
              <input type="radio" name="agent" disabled />
              <Sprite name="blueberry" scale={2} /> Codex（即将支持）
            </label>
          </div>
        </fieldset>

        <label className="check-row">
          <input type="checkbox" checked={remoteControl} onChange={(e) => setRemoteControl(e.target.checked)} />
          <span>
            开启 Remote Control
            <small>在 claude.ai/code 和手机 Claude app 上同步查看、回复。需要 Pro / Max / Team / Enterprise 订阅登录，API key 不支持。</small>
          </span>
        </label>

        {error && <div className="note note-error">{error}</div>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || (!isDemo && !cwd.trim())}>
            种下去
          </button>
        </div>
      </form>
    </div>
  )
}
