import { describe, it, expect } from 'vitest'
import {
  parseMarkdown,
  parseInline,
  markdownToHtml,
  markdownToPlainText,
  isSafeUrl,
  SAMPLE_MARKDOWN,
} from './parser'

describe('markdown parser', () => {
  it('parses headings and builds unique heading slugs for TOC', () => {
    const doc = parseMarkdown('# Intro\n\n## Setup\n\n## Setup\n\n### Details')
    expect(doc.headings).toEqual([
      { id: 'intro', level: 1, text: 'Intro' },
      { id: 'setup', level: 2, text: 'Setup' },
      { id: 'setup-1', level: 2, text: 'Setup' },
      { id: 'details', level: 3, text: 'Details' },
    ])
  })

  it('parses GFM tables with alignments', () => {
    const md = `| Name | Role | Score |\n| :--- | :---: | ---: |\n| Ada | Eng | 98 |`
    const doc = parseMarkdown(md)
    expect(doc.blocks).toHaveLength(1)
    const table = doc.blocks[0]
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.headers).toEqual(['Name', 'Role', 'Score'])
      expect(table.alignments).toEqual(['left', 'center', 'right'])
      expect(table.rows).toEqual([['Ada', 'Eng', '98']])
    }
  })

  it('parses fenced code blocks and GitHub alerts', () => {
    const md = `> [!WARNING]\n> Be careful here.\n\n\`\`\`ts\nconst x = 1\n\`\`\``
    const doc = parseMarkdown(md)
    expect(doc.blocks[0].type).toBe('alert')
    expect(doc.blocks[1]).toEqual({ type: 'code', lang: 'ts', code: 'const x = 1' })
  })

  it('parses task lists and inline formatting safely', () => {
    const md = `- [x] Done **item**\n- [ ] Pending \`code\``
    const doc = parseMarkdown(md)
    expect(doc.blocks[0].type).toBe('list')
    if (doc.blocks[0].type === 'list') {
      expect(doc.blocks[0].items[0].checked).toBe(true)
      expect(doc.blocks[0].items[1].checked).toBe(false)
    }

    const inline = parseInline('**bold** and *italic* and ~~del~~ and [safe](https://example.com)')
    expect(inline.some((n) => n.type === 'strong')).toBe(true)
    expect(inline.some((n) => n.type === 'em')).toBe(true)
    expect(inline.some((n) => n.type === 'del')).toBe(true)
    expect(inline.some((n) => n.type === 'link')).toBe(true)
  })

  it('blocks unsafe javascript URLs and escapes raw HTML', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('https://paperflow.local')).toBe(true)
    const html = markdownToHtml('<script>alert(1)</script> [bad](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })

  it('extracts plain text and stats from sample markdown', () => {
    const doc = parseMarkdown(SAMPLE_MARKDOWN)
    expect(doc.stats.words).toBeGreaterThan(50)
    expect(doc.stats.headings).toBeGreaterThan(3)
    expect(doc.stats.codeBlocks).toBe(1)
    const plain = markdownToPlainText(SAMPLE_MARKDOWN)
    expect(plain).toContain('PaperFlow AI')
    expect(plain).not.toContain('```')
  })
})
