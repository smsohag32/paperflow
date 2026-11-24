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

  it('parses block and inline LaTeX math formulas including \\begin{cases} and preserves currency', () => {
    const md = [
      '$$\\text{Achievement \\%} = \\min\\left(\\text{Cap \\%},\\; \\frac{\\text{Actual}}{\\text{Target}} \\times ১০০\\right)$$',
      '',
      'Score rule: $$\\begin{cases} 100 & \\text{যদি } x \\le 1 \\\\ 0 & \\text{যদি } x > 1 \\end{cases}$$',
      '',
      'Inline $a^2 + b^2 = c^2$ and price $100 stays plain text.',
    ].join('\n')

    const doc = parseMarkdown(md)
    expect(doc.blocks[0].type).toBe('math')
    if (doc.blocks[0].type === 'math') {
      expect(doc.blocks[0].tex).toContain('\\frac{\\text{Actual}}{\\text{Target}}')
    }

    const p1 = doc.blocks[1]
    expect(p1.type).toBe('paragraph')
    if (p1.type === 'paragraph') {
      const nodes = parseInline(p1.text)
      const mathNode = nodes.find((n) => n.type === 'math')
      expect(mathNode).toBeTruthy()
      if (mathNode && mathNode.type === 'math') {
        expect(mathNode.display).toBe(true)
        // Double backslash row separator inside \begin{cases} must NOT be eaten!
        expect(mathNode.tex).toContain('\\\\')
      }
    }

    const p2 = doc.blocks[2]
    expect(p2.type).toBe('paragraph')
    if (p2.type === 'paragraph') {
      const nodes = parseInline(p2.text)
      const mathNodes = nodes.filter((n) => n.type === 'math')
      expect(mathNodes).toHaveLength(1)
      expect(mathNodes[0].type === 'math' && mathNodes[0].tex).toBe('a^2 + b^2 = c^2')
    }
  })
})
