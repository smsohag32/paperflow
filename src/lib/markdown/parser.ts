export type AlertKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

export type TableAlign = 'left' | 'center' | 'right' | null

export interface MdHeading {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
}

export interface MdListItem {
  text: string
  checked: boolean | null
  children: MdBlock[]
}

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'blockquote'; blocks: MdBlock[] }
  | { type: 'alert'; kind: AlertKind; blocks: MdBlock[] }
  | { type: 'list'; ordered: boolean; start: number; items: MdListItem[] }
  | { type: 'table'; headers: string[]; alignments: TableAlign[]; rows: string[][] }
  | { type: 'hr' }

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'del'; children: MdInline[] }
  | { type: 'link'; href: string; title?: string; children: MdInline[] }
  | { type: 'image'; src: string; alt: string; title?: string }
  | { type: 'kbd'; value: string }
  | { type: 'br' }

export interface MarkdownStats {
  words: number
  chars: number
  lines: number
  readingMinutes: number
  headings: number
  codeBlocks: number
  links: number
}

export interface MarkdownDocument {
  blocks: MdBlock[]
  headings: MdHeading[]
  stats: MarkdownStats
}

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

export function slugifyHeading(text: string): string {
  const plain = stripInlineMarkdown(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return plain || 'section'
}

export function isSafeUrl(url: string, allowDataImage = false): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true
  }
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return true
  }
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
    return true
  }
  return false
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1)
  const cells: string[] = []
  let current = ''
  let inCode = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '`') {
      inCode = !inCode
      current += ch
      continue
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

function parseTableSeparator(line: string): TableAlign[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('-')) return null
  const cells = splitTableRow(trimmed)
  if (cells.length === 0) return null
  const alignments: TableAlign[] = []
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) alignments.push('center')
    else if (right) alignments.push('right')
    else if (left) alignments.push('left')
    else alignments.push(null)
  }
  return alignments
}

function isHr(line: string): boolean {
  const t = line.trim()
  return /^(\*{3,}|-{3,}|_{3,})$/.test(t.replace(/\s+/g, '')) && t.length >= 3
}

function isFenceStart(line: string): { marker: string; lang: string } | null {
  const m = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/)
  if (!m) return null
  const marker = m[1]
  const info = m[2].trim()
  if (marker[0] === '`' && info.includes('`')) return null
  return { marker, lang: info.split(/\s+/)[0] || '' }
}

function isListLine(line: string): { indent: number; ordered: boolean; start: number; content: string } | null {
  const ul = line.match(/^(\s*)([-*+])\s+(.*)$/)
  if (ul) {
    return { indent: ul[1].replace(/\t/g, '  ').length, ordered: false, start: 1, content: ul[3] }
  }
  const ol = line.match(/^(\s*)(\d{1,9})[.)]\s+(.*)$/)
  if (ol) {
    return { indent: ol[1].replace(/\t/g, '  ').length, ordered: true, start: Number(ol[2]), content: ol[3] }
  }
  return null
}

function isBlockStarter(lines: string[], idx: number): boolean {
  const line = lines[idx]
  if (!line || !line.trim()) return true
  if (/^\s{0,3}#{1,6}\s+/.test(line)) return true
  if (isFenceStart(line)) return true
  if (/^\s{0,3}>\s?/.test(line)) return true
  if (isHr(line)) return true
  if (isListLine(line)) return true
  if (idx + 1 < lines.length && line.includes('|') && parseTableSeparator(lines[idx + 1])) return true
  return false
}

function parseBlocks(
  lines: string[],
  headings: MdHeading[],
  slugCounts: Map<string, number>,
): MdBlock[] {
  const blocks: MdBlock[] = []
  let i = 0

  const makeHeading = (level: 1 | 2 | 3 | 4 | 5 | 6, rawText: string): MdBlock => {
    const text = rawText.replace(/\s+#+\s*$/, '').trim()
    const base = slugifyHeading(text)
    const count = slugCounts.get(base) ?? 0
    slugCounts.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    headings.push({ id, level, text: stripInlineMarkdown(text) })
    return { type: 'heading', level, id, text }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Blank line
    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code block
    const fence = isFenceStart(line)
    if (fence) {
      const codeLines: string[] = []
      const fenceChar = fence.marker[0]
      const fenceLen = fence.marker.length
      i++
      while (i < lines.length) {
        const closeRe = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLen},}\\s*$`)
        if (closeRe.test(lines[i])) {
          i++
          break
        }
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', lang: fence.lang, code: codeLines.join('\n') })
      continue
    }

    // ATX Heading
    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/)
    if (atx) {
      blocks.push(makeHeading(atx[1].length as 1 | 2 | 3 | 4 | 5 | 6, atx[2]))
      i++
      continue
    }

    // Horizontal Rule
    if (isHr(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Blockquote / GitHub Alert
    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && (/^\s{0,3}>\s?/.test(lines[i]) || (lines[i].trim() !== '' && !isBlockStarter(lines, i)))) {
        quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
        i++
      }
      const firstLine = quoteLines[0]?.trim() ?? ''
      const alertMatch = firstLine.match(ALERT_RE)
      if (alertMatch) {
        const kind = alertMatch[1].toUpperCase() as AlertKind
        const innerBlocks = parseBlocks(quoteLines.slice(1), headings, slugCounts)
        blocks.push({ type: 'alert', kind, blocks: innerBlocks })
      } else {
        const innerBlocks = parseBlocks(quoteLines, headings, slugCounts)
        blocks.push({ type: 'blockquote', blocks: innerBlocks })
      }
      continue
    }

    // GFM Table
    if (i + 1 < lines.length && line.includes('|')) {
      const alignments = parseTableSeparator(lines[i + 1])
      if (alignments) {
        const headers = splitTableRow(line)
        i += 2
        const rows: string[][] = []
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          rows.push(splitTableRow(lines[i]))
          i++
        }
        blocks.push({ type: 'table', headers, alignments, rows })
        continue
      }
    }

    // Lists (ordered, unordered, task lists, nested)
    const listStart = isListLine(line)
    if (listStart) {
      const baseIndent = listStart.indent
      const ordered = listStart.ordered
      const start = listStart.start
      const items: MdListItem[] = []

      while (i < lines.length) {
        const current = isListLine(lines[i])
        if (!current || current.indent !== baseIndent || current.ordered !== ordered) break

        let content = current.content
        let checked: boolean | null = null
        const task = content.match(/^\[([ xX])\]\s+(.*)$/)
        if (task) {
          checked = task[1].toLowerCase() === 'x'
          content = task[2]
        }

        i++
        const childLines: string[] = []
        while (i < lines.length) {
          const next = lines[i]
          if (!next.trim()) {
            // Check if next non-empty line is indented child or same-level item
            let lookahead = i + 1
            while (lookahead < lines.length && !lines[lookahead].trim()) lookahead++
            if (lookahead < lines.length) {
              const nextIndent = next.length === 0 ? (lines[lookahead].match(/^(\s*)/)?.[1].replace(/\t/g, '  ').length ?? 0) : 0
              if (nextIndent > baseIndent) {
                childLines.push('')
                i++
                continue
              }
            }
            break
          }
          const nextList = isListLine(next)
          if (nextList && nextList.indent <= baseIndent) break
          const indentLen = next.match(/^(\s*)/)?.[1].replace(/\t/g, '  ').length ?? 0
          if (indentLen > baseIndent) {
            childLines.push(next.replace(/\t/g, '  ').slice(Math.min(indentLen, baseIndent + 2)))
            i++
          } else {
            // Lazy continuation of same list item
            content += ' ' + next.trim()
            i++
          }
        }

        const children = childLines.length > 0 ? parseBlocks(childLines, headings, slugCounts) : []
        items.push({ text: content, checked, children })
      }

      blocks.push({ type: 'list', ordered, start, items })
      continue
    }

    // Setext Heading (underline === or ---)
    if (i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
      const level = lines[i + 1].trim().startsWith('=') ? 1 : 2
      blocks.push(makeHeading(level, line))
      i += 2
      continue
    }

    // Paragraph
    const paraLines: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines, i)) {
      if (i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) break
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
  }

  return blocks
}

export function parseInline(text: string): MdInline[] {
  const tokens: MdInline[] = []
  let i = 0
  let buf = ''

  const flush = () => {
    if (buf) {
      tokens.push({ type: 'text', value: buf })
      buf = ''
    }
  }

  while (i < text.length) {
    // Hard line break (two spaces + newline or <br>)
    if (text[i] === '\n') {
      if (buf.endsWith('  ')) {
        buf = buf.slice(0, -2)
        flush()
        tokens.push({ type: 'br' })
      } else {
        buf += ' '
      }
      i++
      continue
    }

    // Backslash escape
    if (text[i] === '\\' && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])) {
      buf += text[i + 1]
      i += 2
      continue
    }

    // <br> / <br/>
    const brMatch = text.slice(i).match(/^<br\s*\/?>/i)
    if (brMatch) {
      flush()
      tokens.push({ type: 'br' })
      i += brMatch[0].length
      continue
    }

    // <kbd>...</kbd>
    const kbdMatch = text.slice(i).match(/^<kbd>([^<]+)<\/kbd>/i)
    if (kbdMatch) {
      flush()
      tokens.push({ type: 'kbd', value: kbdMatch[1] })
      i += kbdMatch[0].length
      continue
    }

    // Inline code (`code` or ``code``)
    if (text[i] === '`') {
      const tickMatch = text.slice(i).match(/^(`+)/)
      if (tickMatch) {
        const ticks = tickMatch[1]
        const end = text.indexOf(ticks, i + ticks.length)
        if (end !== -1) {
          flush()
          tokens.push({ type: 'code', value: text.slice(i + ticks.length, end).trim() })
          i = end + ticks.length
          continue
        }
      }
    }

    // Image ![alt](src "title")
    if (text[i] === '!' && text[i + 1] === '[') {
      const imgMatch = text.slice(i).match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/)
      if (imgMatch && isSafeUrl(imgMatch[2], true)) {
        flush()
        tokens.push({ type: 'image', alt: imgMatch[1], src: imgMatch[2], title: imgMatch[3] })
        i += imgMatch[0].length
        continue
      }
    }

    // Link [label](href "title")
    if (text[i] === '[') {
      const linkMatch = text.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/)
      if (linkMatch && isSafeUrl(linkMatch[2], false)) {
        flush()
        tokens.push({
          type: 'link',
          href: linkMatch[2],
          title: linkMatch[3],
          children: parseInline(linkMatch[1]),
        })
        i += linkMatch[0].length
        continue
      }
    }

    // Autolink <https://...>
    if (text[i] === '<') {
      const autoMatch = text.slice(i).match(/^<(https?:\/\/[^\s>]+)>/)
      if (autoMatch) {
        flush()
        tokens.push({
          type: 'link',
          href: autoMatch[1],
          children: [{ type: 'text', value: autoMatch[1] }],
        })
        i += autoMatch[0].length
        continue
      }
    }

    // Bare URL https://...
    if ((text[i] === 'h' || text[i] === 'H') && (i === 0 || /\s/.test(text[i - 1]))) {
      const urlMatch = text.slice(i).match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/)
      if (urlMatch) {
        flush()
        tokens.push({
          type: 'link',
          href: urlMatch[0],
          children: [{ type: 'text', value: urlMatch[0] }],
        })
        i += urlMatch[0].length
        continue
      }
    }

    // Bold + Italic ***...*** or ___...___
    const boldItalic = text.slice(i).match(/^(\*\*\*|___)(?=\S)(.+?)(?<=\S)\1/)
    if (boldItalic) {
      flush()
      tokens.push({
        type: 'strong',
        children: [{ type: 'em', children: parseInline(boldItalic[2]) }],
      })
      i += boldItalic[0].length
      continue
    }

    // Bold **...** or __...__
    const bold = text.slice(i).match(/^(\*\*|__)(?=\S)(.+?)(?<=\S)\1/)
    if (bold) {
      flush()
      tokens.push({ type: 'strong', children: parseInline(bold[2]) })
      i += bold[0].length
      continue
    }

    // Strikethrough ~~...~~
    const del = text.slice(i).match(/^~~(?=\S)(.+?)(?<=\S)~~/)
    if (del) {
      flush()
      tokens.push({ type: 'del', children: parseInline(del[1]) })
      i += del[0].length
      continue
    }

    // Italic *...* or _..._
    const italic = text.slice(i).match(/^(\*|_)(?=\S)([^*_\n]+?)(?<=\S)\1/)
    if (italic && !(italic[1] === '_' && i > 0 && /\w/.test(text[i - 1]))) {
      flush()
      tokens.push({ type: 'em', children: parseInline(italic[2]) })
      i += italic[0].length
      continue
    }

    buf += text[i]
    i++
  }

  flush()
  return tokens
}

export function stripInlineMarkdown(text: string): string {
  const inlineToText = (nodes: MdInline[]): string =>
    nodes
      .map((n) => {
        switch (n.type) {
          case 'text':
          case 'code':
          case 'kbd':
            return n.value
          case 'image':
            return n.alt
          case 'br':
            return '\n'
          case 'strong':
          case 'em':
          case 'del':
          case 'link':
            return inlineToText(n.children)
        }
      })
      .join('')
  return inlineToText(parseInline(text))
}

function countStats(src: string, blocks: MdBlock[], headings: MdHeading[]): MarkdownStats {
  const lines = src === '' ? 0 : src.replace(/\r\n/g, '\n').split('\n').length
  const plain = markdownToPlainText(src).trim()
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200))

  let codeBlocks = 0
  let links = 0

  const walkInline = (nodes: MdInline[]) => {
    for (const n of nodes) {
      if (n.type === 'link') links++
      if ('children' in n) walkInline(n.children)
    }
  }

  const walkBlocks = (list: MdBlock[]) => {
    for (const b of list) {
      if (b.type === 'code') codeBlocks++
      else if (b.type === 'paragraph' || b.type === 'heading') walkInline(parseInline(b.text))
      else if (b.type === 'blockquote' || b.type === 'alert') walkBlocks(b.blocks)
      else if (b.type === 'list') {
        for (const item of b.items) {
          walkInline(parseInline(item.text))
          walkBlocks(item.children)
        }
      } else if (b.type === 'table') {
        b.headers.forEach((h) => walkInline(parseInline(h)))
        b.rows.forEach((r) => r.forEach((c) => walkInline(parseInline(c))))
      }
    }
  }

  walkBlocks(blocks)

  return {
    words,
    chars: src.length,
    lines,
    readingMinutes,
    headings: headings.length,
    codeBlocks,
    links,
  }
}

export function parseMarkdown(src: string): MarkdownDocument {
  const normalized = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const headings: MdHeading[] = []
  const slugCounts = new Map<string, number>()
  const blocks = parseBlocks(lines, headings, slugCounts)
  const stats = countStats(normalized, blocks, headings)
  return { blocks, headings, stats }
}

function inlineToHtml(nodes: MdInline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escapeHtml(n.value)
        case 'code':
          return `<code>${escapeHtml(n.value)}</code>`
        case 'kbd':
          return `<kbd>${escapeHtml(n.value)}</kbd>`
        case 'br':
          return '<br />'
        case 'strong':
          return `<strong>${inlineToHtml(n.children)}</strong>`
        case 'em':
          return `<em>${inlineToHtml(n.children)}</em>`
        case 'del':
          return `<del>${inlineToHtml(n.children)}</del>`
        case 'image':
          return `<img src="${escapeHtml(n.src)}" alt="${escapeHtml(n.alt)}"${n.title ? ` title="${escapeHtml(n.title)}"` : ''} />`
        case 'link':
          return `<a href="${escapeHtml(n.href)}"${n.title ? ` title="${escapeHtml(n.title)}"` : ''} target="_blank" rel="noopener noreferrer">${inlineToHtml(n.children)}</a>`
      }
    })
    .join('')
}

function blocksToHtml(blocks: MdBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `<h${b.level} id="${escapeHtml(b.id)}">${inlineToHtml(parseInline(b.text))}</h${b.level}>`
        case 'paragraph':
          return `<p>${inlineToHtml(parseInline(b.text))}</p>`
        case 'code':
          return `<pre><code${b.lang ? ` class="language-${escapeHtml(b.lang)}"` : ''}>${escapeHtml(b.code)}</code></pre>`
        case 'blockquote':
          return `<blockquote>${blocksToHtml(b.blocks)}</blockquote>`
        case 'alert':
          return `<blockquote class="alert alert-${b.kind.toLowerCase()}"><p><strong>${b.kind}</strong></p>${blocksToHtml(b.blocks)}</blockquote>`
        case 'hr':
          return '<hr />'
        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul'
          const startAttr = b.ordered && b.start !== 1 ? ` start="${b.start}"` : ''
          const items = b.items
            .map((item) => {
              const checkbox =
                item.checked !== null
                  ? `<input type="checkbox" disabled${item.checked ? ' checked' : ''} /> `
                  : ''
              return `<li>${checkbox}${inlineToHtml(parseInline(item.text))}${blocksToHtml(item.children)}</li>`
            })
            .join('')
          return `<${tag}${startAttr}>${items}</${tag}>`
        }
        case 'table': {
          const thead = b.headers
            .map((h, idx) => {
              const align = b.alignments[idx]
              return `<th${align ? ` style="text-align:${align}"` : ''}>${inlineToHtml(parseInline(h))}</th>`
            })
            .join('')
          const tbody = b.rows
            .map(
              (row) =>
                `<tr>${b.headers
                  .map((_, idx) => {
                    const align = b.alignments[idx]
                    return `<td${align ? ` style="text-align:${align}"` : ''}>${inlineToHtml(parseInline(row[idx] ?? ''))}</td>`
                  })
                  .join('')}</tr>`,
            )
            .join('')
          return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
        }
      }
    })
    .join('\n')
}

export function markdownToHtml(src: string): string {
  const { blocks } = parseMarkdown(src)
  return blocksToHtml(blocks)
}

function blocksToPlainText(blocks: MdBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
        case 'paragraph':
          return stripInlineMarkdown(b.text)
        case 'code':
          return b.code
        case 'blockquote':
          return blocksToPlainText(b.blocks)
        case 'alert':
          return `${b.kind}: ${blocksToPlainText(b.blocks)}`
        case 'hr':
          return '---'
        case 'list':
          return b.items
            .map((item, idx) => {
              const prefix =
                item.checked !== null
                  ? item.checked
                    ? '[x] '
                    : '[ ] '
                  : b.ordered
                    ? `${b.start + idx}. `
                    : '• '
              const nested = item.children.length ? '\n' + blocksToPlainText(item.children) : ''
              return `${prefix}${stripInlineMarkdown(item.text)}${nested}`
            })
            .join('\n')
        case 'table': {
          const header = b.headers.map(stripInlineMarkdown).join(' | ')
          const rows = b.rows.map((r) => r.map(stripInlineMarkdown).join(' | ')).join('\n')
          return rows ? `${header}\n${rows}` : header
        }
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

export function markdownToPlainText(src: string): string {
  const normalized = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const blocks = parseBlocks(lines, [], new Map())
  return blocksToPlainText(blocks)
}

export function buildStandaloneHtml(src: string, title: string, dark: boolean): string {
  const body = markdownToHtml(src)
  const bg = dark ? '#1e1e20' : '#ffffff'
  const fg = dark ? '#d6d6da' : '#1f2328'
  const muted = dark ? '#93939b' : '#59636e'
  const border = dark ? '#333338' : '#d0d7de'
  const surface = dark ? '#242427' : '#f6f8fa'
  const accent = dark ? '#7c89f2' : '#4f5bd5'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 2.5rem 1.5rem; background: ${bg}; color: ${fg}; font-family: Inter, system-ui, -apple-system, sans-serif; line-height: 1.7; }
    main { max-width: 820px; margin: 0 auto; }
    h1, h2, h3, h4 { line-height: 1.3; margin-top: 1.6em; margin-bottom: 0.6em; font-weight: 600; }
    h1 { font-size: 2rem; padding-bottom: 0.35em; border-bottom: 1px solid ${border}; }
    h2 { font-size: 1.5rem; padding-bottom: 0.3em; border-bottom: 1px solid ${border}; }
    a { color: ${accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.875em; background: ${surface}; padding: 0.15em 0.4em; border-radius: 5px; border: 1px solid ${border}; }
    pre { background: ${surface}; border: 1px solid ${border}; border-radius: 10px; padding: 1rem 1.25rem; overflow-x: auto; }
    pre code { background: none; border: none; padding: 0; font-size: 0.85rem; }
    blockquote { margin: 1.2em 0; padding: 0.6em 1rem; border-left: 3px solid ${accent}; background: ${surface}; border-radius: 0 8px 8px 0; color: ${muted}; }
    table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.92rem; }
    th, td { border: 1px solid ${border}; padding: 0.55rem 0.75rem; }
    th { background: ${surface}; font-weight: 600; }
    hr { border: none; border-top: 1px solid ${border}; margin: 2em 0; }
    img { max-width: 100%; border-radius: 8px; }
    kbd { font-family: monospace; font-size: 0.8em; padding: 0.15em 0.45em; border-radius: 4px; border: 1px solid ${border}; background: ${surface}; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`
}

export const SAMPLE_MARKDOWN = `# PaperFlow AI — Markdown Studio

Welcome to the **PaperFlow Markdown Previewer** — a fast, private, theme-aware reader and editor that runs **100% locally** in your browser.

> [!TIP]
> Switch between **Light** and **Dark** themes from the top bar, or try **Split View** to edit Markdown with instant live preview. Every code block and the full document can be copied with one click.

## Key Capabilities

- **Theme-Aware Styling**: Automatically adapts background, typography, borders, and code surfaces to your active theme.
- **Accurate GFM Rendering**: Supports headings, tables, task lists, GitHub callouts, fenced code blocks, inline code, links, and nested lists.
- **One-Click Copy**: Copy plain text, raw Markdown, rendered HTML, or individual code snippets effortlessly.
- **Zero Uploads**: Your \`.md\` files stay completely private on your device.

## Quick Checklist

- [x] Drop or browse any \`.md\` / \`.markdown\` file
- [x] Navigate long documents with the auto-generated **Table of Contents**
- [x] Copy formatted text or individual code blocks
- [ ] Export to standalone HTML or print directly to PDF

## Feature Comparison

| Feature | Preview Mode | Split Mode | Export |
| :--- | :---: | :---: | ---: |
| Live GFM Typography | Supported | Supported | HTML / PDF |
| Interactive Outline | Auto-synced | Auto-synced | Anchors |
| Copyable Content Box | One-click | One-click | Markdown / Text |
| Keyboard Shortcuts | <kbd>Ctrl</kbd> + <kbd>C</kbd> | Live edit | Instant |

## Code Snippet Example

\`\`\`typescript
export async function readMarkdownFile(file: File): Promise<string> {
  const content = await file.text()
  return content.trim()
}
\`\`\`

> [!NOTE]
> You can also paste Markdown directly into the **Split** or **Source** editor, or drag-and-drop a \`.md\` file anywhere onto this page.

---

> "Simplicity is prerequisite for reliability." — *Edsger W. Dijkstra*
`
