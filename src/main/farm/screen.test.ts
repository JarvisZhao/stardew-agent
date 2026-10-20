import { describe, expect, it } from 'vitest'
import { highlightedOption, knownDialog, looksLikeDialog, optionMatches } from './screen'

// Captured from the real Claude Code 2.1.304 in a fresh folder.
const TRUST = `────────────────────────────────────────
 Accessing workspace:

 /tmp/rc-cwd-5GfsQS

 Quick safety check: Is this a project you created or one you trust?

 Claude Code'll be able to read, edit, and execute files here.

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel`

describe('screen helpers', () => {
  it('recognizes the trust dialog and its highlighted option', () => {
    expect(looksLikeDialog(TRUST)).toBe(true)
    expect(knownDialog(TRUST)).toBe('trust')
    expect(highlightedOption(TRUST)).toBe('No, exit')
  })

  it('reads numbered permission menus', () => {
    const menu = 'Bash(npm test)\n❯ 1. Yes\n  2. Yes, and don\'t ask again\n  3. No'
    expect(highlightedOption(menu)).toBe('1. Yes')
    expect(optionMatches('1. Yes', 'Yes')).toBe(true)
    expect(optionMatches('2. Yes, I trust this folder', 'yes, i trust')).toBe(true)
    expect(optionMatches('No, exit', 'Yes')).toBe(false)
  })

  it('does not mistake a normal prompt for a menu', () => {
    expect(looksLikeDialog('> fix the bug\n')).toBe(false)
    expect(highlightedOption('❯ Yes please do it')).toBeNull()
  })
})
