import { openPdf } from './pdfjs'
import { throwIfAborted } from '@/lib/performance/task-queue'

export interface ExtractedPageText {
  pageIndex: number
  text: string
  wordCount: number
  width: number
  height: number
  /** Likely a scanned page (almost no selectable text) */
  needsOcr: boolean
}

export interface ExtractedTable {
  pageIndex: number
  rows: string[][]
}

export interface DocumentClassification {
  type:
    | 'Resume / CV'
    | 'Invoice'
    | 'Receipt'
    | 'Contract / Agreement'
    | 'Certificate'
    | 'Academic Transcript'
    | 'Research Paper'
    | 'Form'
    | 'Report'
    | 'Letter'
    | 'Book / Manual'
    | 'General Document'
  confidence: number
  reasons: string[]
  suggestedTools: string[]
}

export interface PageAuditResult {
  pageCount: number
  blankPages: number[]
  duplicatePairs: [number, number][]
  scannedPages: number[]
  mixedDimensions: boolean
  landscapePages: number[]
  summary: string
}

interface PositionedItem {
  str: string
  x: number
  y: number
  w: number
}

/** Extract text from every page (or a subset) with line grouping. */
export async function extractPdfText(
  file: Blob | Uint8Array,
  opts: { password?: string; pages?: number[]; signal?: AbortSignal; onProgress?: (p: number) => void } = {},
): Promise<ExtractedPageText[]> {
  const pdf = await openPdf(file, { password: opts.password })
  const indices = opts.pages?.length ? opts.pages : Array.from({ length: pdf.numPages }, (_, i) => i)
  const results: ExtractedPageText[] = []

  try {
    for (let i = 0; i < indices.length; i++) {
      throwIfAborted(opts.signal)
      const pIdx = indices[i]
      const page = await pdf.getPage(pIdx + 1)
      const vp = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PositionedItem[] = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue
        const tx = it.transform
        items.push({ str: it.str, x: tx[4], y: tx[5], w: it.width })
      }
      // Sort top-to-bottom (higher PDF y first), then left-to-right
      items.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? b.y - a.y : a.x - b.x))
      const lines: string[] = []
      let curLine: PositionedItem[] = []
      let curY = items[0]?.y ?? 0
      for (const it of items) {
        if (Math.abs(it.y - curY) > 4 && curLine.length) {
          lines.push(curLine.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim())
          curLine = []
          curY = it.y
        }
        curLine.push(it)
      }
      if (curLine.length) lines.push(curLine.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim())
      const text = lines.join('\n')
      const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0
      results.push({
        pageIndex: pIdx,
        text,
        wordCount,
        width: Math.round(vp.width),
        height: Math.round(vp.height),
        needsOcr: wordCount < 8,
      })
      opts.onProgress?.((i + 1) / indices.length)
    }
    return results
  } finally {
    await pdf.destroy()
  }
}

/**
 * Spatial table extractor: clusters text items into rows by Y-coordinate and
 * splits columns where consistent horizontal gaps appear across >= 2 consecutive rows.
 */
export async function extractPdfTables(
  file: Blob | Uint8Array,
  opts: { password?: string; pages?: number[]; signal?: AbortSignal } = {},
): Promise<ExtractedTable[]> {
  const pdf = await openPdf(file, { password: opts.password })
  const indices = opts.pages?.length ? opts.pages : Array.from({ length: pdf.numPages }, (_, i) => i)
  const tables: ExtractedTable[] = []

  try {
    for (const pIdx of indices) {
      throwIfAborted(opts.signal)
      const page = await pdf.getPage(pIdx + 1)
      const content = await page.getTextContent()
      const items: PositionedItem[] = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue
        items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width })
      }
      if (items.length < 4) continue

      // Group into rows (within 5pt vertical tolerance)
      items.sort((a, b) => (Math.abs(a.y - b.y) > 5 ? b.y - a.y : a.x - b.x))
      const rows: PositionedItem[][] = []
      for (const it of items) {
        const last = rows[rows.length - 1]
        if (!last || Math.abs(last[0].y - it.y) > 5) rows.push([it])
        else last.push(it)
      }

      // Split each row into cells when horizontal gap > 14pt
      const cellRows: string[][] = rows.map((row) => {
        row.sort((a, b) => a.x - b.x)
        const cells: string[] = []
        let cur = row[0].str
        let prevEnd = row[0].x + row[0].w
        for (let i = 1; i < row.length; i++) {
          const gap = row[i].x - prevEnd
          if (gap > 14) {
            cells.push(cur.trim())
            cur = row[i].str
          } else {
            cur += (gap > 2 ? ' ' : '') + row[i].str
          }
          prevEnd = Math.max(prevEnd, row[i].x + row[i].w)
        }
        cells.push(cur.trim())
        return cells
      })

      // Collect contiguous runs of >= 2 rows that each have >= 2 columns
      let current: string[][] = []
      for (const r of cellRows) {
        if (r.length >= 2) {
          current.push(r)
        } else {
          if (current.length >= 2) tables.push({ pageIndex: pIdx, rows: normalizeCols(current) })
          current = []
        }
      }
      if (current.length >= 2) tables.push({ pageIndex: pIdx, rows: normalizeCols(current) })
    }
    return tables
  } finally {
    await pdf.destroy()
  }
}

function normalizeCols(rows: string[][]) {
  const maxCols = Math.max(...rows.map((r) => r.length))
  return rows.map((r) => (r.length < maxCols ? [...r, ...Array(maxCols - r.length).fill('')] : r))
}

export function tableToCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const needsQuote = /[",\n]/.test(c)
          return needsQuote ? `"${c.replace(/"/g, '""')}"` : c
        })
        .join(','),
    )
    .join('\n')
}

/** Rule-based + keyword document classifier (instant, zero-download, 100% local). */
export function classifyDocument(fullText: string, pageCount: number): DocumentClassification {
  const lower = fullText.toLowerCase()
  const rules: {
    type: DocumentClassification['type']
    keywords: string[]
    tools: string[]
  }[] = [
    {
      type: 'Resume / CV',
      keywords: ['experience', 'education', 'skills', 'curriculum vitae', 'resume', 'linkedin', 'references', 'projects'],
      tools: ['ai', 'compress', 'protect'],
    },
    {
      type: 'Invoice',
      keywords: ['invoice', 'subtotal', 'total due', 'bill to', 'payment terms', 'tax', 'qty', 'unit price'],
      tools: ['extract', 'compress', 'sign'],
    },
    {
      type: 'Receipt',
      keywords: ['receipt', 'change due', 'visa', 'mastercard', 'cashier', 'thank you for shopping', 'subtotal'],
      tools: ['enhance', 'ocr', 'extract'],
    },
    {
      type: 'Contract / Agreement',
      keywords: ['agreement', 'hereinafter', 'party', 'witnesseth', 'signature', 'terms and conditions', 'indemnify', 'governing law'],
      tools: ['sign', 'ai', 'protect'],
    },
    {
      type: 'Certificate',
      keywords: ['certificate', 'certify that', 'awarded to', 'completion', 'achievement', 'honors'],
      tools: ['enhance', 'protect', 'compress'],
    },
    {
      type: 'Academic Transcript',
      keywords: ['transcript', 'gpa', 'cgpa', 'semester', 'credit hours', 'grade', 'course'],
      tools: ['extract', 'ocr', 'protect'],
    },
    {
      type: 'Research Paper',
      keywords: ['abstract', 'introduction', 'methodology', 'references', 'conclusion', 'et al', 'doi', 'keywords'],
      tools: ['ai', 'extract', 'workspace'],
    },
    {
      type: 'Form',
      keywords: ['applicant', 'date of birth', 'signature', 'please fill', 'check all that apply', 'form '],
      tools: ['workspace', 'sign', 'protect'],
    },
    {
      type: 'Letter',
      keywords: ['dear ', 'sincerely', 'regards', 'yours truly', 'to whom it may concern'],
      tools: ['sign', 'workspace', 'ai'],
    },
    {
      type: 'Report',
      keywords: ['executive summary', 'findings', 'quarterly', 'annual report', 'table of contents', 'recommendations'],
      tools: ['ai', 'extract', 'compress'],
    },
  ]

  let best: { rule: (typeof rules)[number]; hits: string[] } | null = null
  for (const rule of rules) {
    const hits = rule.keywords.filter((k) => lower.includes(k))
    if (hits.length >= 2 && (!best || hits.length > best.hits.length)) {
      best = { rule, hits }
    }
  }

  if (best) {
    return {
      type: best.rule.type,
      confidence: Math.min(0.95, 0.45 + best.hits.length * 0.12),
      reasons: [`Matched signals: ${best.hits.slice(0, 4).join(', ')}`],
      suggestedTools: best.rule.tools,
    }
  }

  if (pageCount >= 25) {
    return {
      type: 'Book / Manual',
      confidence: 0.65,
      reasons: [`Long document (${pageCount} pages)`],
      suggestedTools: ['split', 'ai', 'compress'],
    }
  }

  return {
    type: 'General Document',
    confidence: 0.5,
    reasons: ['No specialized template detected'],
    suggestedTools: ['workspace', 'compress', 'ai'],
  }
}

/** Audit pages for blank pages, duplicates, scanned pages, and mixed dimensions. */
export async function auditPages(
  file: Blob | Uint8Array,
  opts: { password?: string; signal?: AbortSignal } = {},
): Promise<PageAuditResult> {
  const pages = await extractPdfText(file, opts)
  const blankPages: number[] = []
  const scannedPages: number[] = []
  const landscapePages: number[] = []
  const duplicatePairs: [number, number][] = []
  const seenText = new Map<string, number>()
  const dims = new Set<string>()

  for (const p of pages) {
    dims.add(`${Math.round(p.width / 10)}x${Math.round(p.height / 10)}`)
    if (p.width > p.height) landscapePages.push(p.pageIndex)
    if (p.wordCount === 0) {
      blankPages.push(p.pageIndex)
      scannedPages.push(p.pageIndex)
    } else {
      if (p.needsOcr) scannedPages.push(p.pageIndex)
      const norm = p.text.toLowerCase().replace(/\s+/g, ' ').trim()
      if (norm.length > 30) {
        const prev = seenText.get(norm)
        if (prev !== undefined) duplicatePairs.push([prev, p.pageIndex])
        else seenText.set(norm, p.pageIndex)
      }
    }
  }

  const mixedDimensions = dims.size > 1
  const parts: string[] = []
  if (blankPages.length) parts.push(`${blankPages.length} blank/image-only`)
  if (duplicatePairs.length) parts.push(`${duplicatePairs.length} duplicate pair(s)`)
  if (mixedDimensions) parts.push('mixed page sizes')
  if (landscapePages.length && landscapePages.length < pages.length) {
    parts.push(`${landscapePages.length} landscape page(s)`)
  }

  return {
    pageCount: pages.length,
    blankPages,
    duplicatePairs,
    scannedPages,
    mixedDimensions,
    landscapePages,
    summary: parts.length ? parts.join(' · ') : 'No structural issues detected.',
  }
}
