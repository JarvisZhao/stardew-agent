// A headless terminal per plot. The Claude Code TUI draws into it so we can read
// the current screen as text (for dialogs the chat panel has no card for yet)
// and know which input modes the TUI turned on.

import { Terminal } from '@xterm/headless'
import type { KeyName, ScreenSnapshot } from '../../shared/api'

export const SCREEN_COLS = 88
export const SCREEN_ROWS = 30

export class Screen {
  private readonly term = new Terminal({ cols: SCREEN_COLS, rows: SCREEN_ROWS, scrollback: 0, allowProposedApi: true })

  write(data: string): void {
    this.term.write(data)
  }

  snapshot(): ScreenSnapshot {
    const buffer = this.term.buffer.active
    const lines: string[] = []
    for (let y = 0; y < this.term.rows; y++) {
      lines.push(buffer.getLine(buffer.baseY + y)?.translateToString(true) ?? '')
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    const text = lines.join('\n')
    const dialog = looksLikeDialog(text)
    return { text, dialog, known: dialog ? knownDialog(text) : null }
  }

  /** Text the way a real terminal would paste it, so the TUI treats it as one input. */
  paste(text: string): string {
    if (this.term.modes.bracketedPasteMode) return `\x1b[200~${text}\x1b[201~`
    // Without bracketed paste a newline would submit early.
    return text.replace(/\r?\n/g, ' ')
  }

  key(name: KeyName): string {
    const app = this.term.modes.applicationCursorKeysMode
    switch (name) {
      case 'enter':
        return '\r'
      case 'escape':
        return '\x1b'
      case 'tab':
        return '\t'
      case 'space':
        return ' '
      case 'up':
        return app ? '\x1bOA' : '\x1b[A'
      case 'down':
        return app ? '\x1bOB' : '\x1b[B'
      case 'right':
        return app ? '\x1bOC' : '\x1b[C'
      case 'left':
        return app ? '\x1bOD' : '\x1b[D'
      default:
        return name
    }
  }

  dispose(): void {
    this.term.dispose()
  }
}

/**
 * Heuristic for "a menu is open": numbered choices with a selection marker, or the
 * usual confirm/cancel hints. Only used to decide whether to show the screen card,
 * never to decide what to type.
 */
export function looksLikeDialog(text: string): boolean {
  return /[❯›]\s*\d+\.\s/.test(text) || /(Enter|Esc) to (confirm|select|cancel|go back)/i.test(text) || /\(y\/n\)/i.test(text)
}

/** Dialogs the chat panel has a dedicated card for. */
export function knownDialog(text: string): ScreenSnapshot['known'] {
  if (/Yes, I trust this folder/i.test(text)) return 'trust'
  return null
}

/**
 * The currently highlighted menu option ("❯ 1. Yes" → "1. Yes"), or null when no
 * menu is showing. Only menus count: the line must look like an option.
 */
export function highlightedOption(text: string): string | null {
  if (!looksLikeDialog(text)) return null
  const line = text.split('\n').find((l) => /^\s*[❯›]\s*\S/.test(l))
  return line ? line.replace(/^\s*[❯›]\s*/, '').trim() : null
}

/** Does a menu option ("2. Yes, I trust this folder") start with this label? */
export function optionMatches(option: string, label: string): boolean {
  const plain = option.replace(/^\d+\.\s*/, '').trim().toLowerCase()
  return plain.startsWith(label.trim().toLowerCase())
}
