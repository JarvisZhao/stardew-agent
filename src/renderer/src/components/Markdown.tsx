// A small, safe Markdown renderer for chat messages: code blocks, headings,
// lists, paragraphs, inline code, bold and links. Builds React elements only;
// never injects HTML.

import { Fragment, type ReactNode } from 'react'

type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string }

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseBlocks(text).map((block, i) => {
        switch (block.type) {
          case 'code':
            return (
              <pre key={i} className="md-code">
                <code>{block.text}</code>
              </pre>
            )
          case 'heading':
            return (
              <p key={i} className={`md-h md-h${Math.min(block.level, 3)}`}>
                {inline(block.text)}
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            )
          }
          case 'paragraph':
            return <p key={i}>{inline(block.text)}</p>
        }
      })}
    </div>
  )
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*```(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', lang: fence[1], text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && bullet.test(lines[i])) items.push(lines[i++].replace(bullet, ''))
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (line.trim() === '') {
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !bullet.test(lines[i])) {
      para.push(lines[i++])
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') })
  }
  return blocks
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

function inline(text: string): ReactNode {
  const parts = text.split(INLINE)
  return parts.map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    const link = /^\[([^\]]+)\]\((.+)\)$/.exec(part)!
    return (
      <a key={i} href={link[2]} target="_blank" rel="noreferrer">
        {link[1]}
      </a>
    )
  })
}
