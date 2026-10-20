import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { farm } from '../api'

const THEME = {
  background: '#1f1610',
  foreground: '#f4e4bc',
  cursor: '#ffd84a',
  cursorAccent: '#1f1610',
  selectionBackground: '#7a4a2288',
  black: '#2b1a0e',
  brightBlack: '#6b5a48'
}

/** The plot's live terminal: replays recent output, then streams. */
export function TerminalView({ plotId }: { plotId: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "SF Mono", Menlo, "Noto Sans Mono CJK SC", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)

    // Live chunks that arrive before the replay are queued, then trimmed by offset
    // so nothing is printed twice.
    let replayedTo: number | null = null
    const queued: Array<[string, number]> = []
    const writeChunk = (data: string, start: number): void => {
      if (replayedTo === null) return void queued.push([data, start])
      const skip = replayedTo - start
      if (skip >= data.length) return
      term.write(skip > 0 ? data.slice(skip) : data)
      replayedTo = start + data.length
    }
    const offOutput = farm.onOutput((id, data, start) => {
      if (id === plotId) writeChunk(data, start)
    })
    let disposed = false
    void farm.readOutput(plotId).then(({ data, end }) => {
      if (disposed) return
      term.write(data)
      replayedTo = end
      queued.splice(0).forEach(([d, s]) => writeChunk(d, s))
    })

    // Ctrl/Cmd+C copies when text is selected; otherwise it goes to the agent as usual.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      return true
    })
    const input = term.onData((data) => farm.write(plotId, data))
    const resize = (): void => {
      try {
        fit.fit()
        farm.resize(plotId, term.cols, term.rows)
      } catch {
        // Not laid out yet.
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host.current!)
    resize()
    term.focus()

    return () => {
      disposed = true
      offOutput()
      input.dispose()
      observer.disconnect()
      term.dispose()
    }
  }, [plotId])

  return <div className="terminal" ref={host} />
}
