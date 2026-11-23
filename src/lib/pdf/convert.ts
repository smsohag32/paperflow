import { rgb, StandardFonts } from '@cantoo/pdf-lib'
import { loadPdfLib, savePdf } from './pdflib'
import { closePdf, openPdf } from './pdfjs'
import type { OutputFile } from '@/types/common'
import { baseName } from '@/lib/utils/format'
import { throwIfAborted } from '@/lib/performance/task-queue'

export const PAGE_SIZES = {
  a4: { label: 'A4 (210 × 297 mm)', width: 595.28, height: 841.89 },
  letter: { label: 'US Letter (8.5 × 11 in)', width: 612, height: 792 },
  legal: { label: 'US Legal (8.5 × 14 in)', width: 612, height: 1008 },
  fit: { label: 'Match image size', width: 0, height: 0 },
  custom: { label: 'Custom (pt)', width: 595.28, height: 841.89 },
} as const

export type PageSizeKey = keyof typeof PAGE_SIZES

export interface ImagesToPdfOptions {
  pageSize: PageSizeKey
  customWidth?: number
  customHeight?: number
  orientation: 'portrait' | 'landscape'
  margin: number
  fitMode: 'fit' | 'fill'
  align: 'center' | 'top'
  bgColor: string
  onProgress?: (p: number) => void
}

function hexToRgb(hex: string) {
  const c = hex.replace('#', '')
  if (c.length !== 6) return rgb(1, 1, 1)
  return rgb(parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255)
}

/** Convert WebP or non-PNG/JPG browser images into PNG/JPEG bytes via Canvas. */
async function normalizeImageForPdf(file: Blob): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' }> {
  const raw = new Uint8Array(await file.arrayBuffer())
  if (raw[0] === 0x89 && raw[1] === 0x50) return { bytes: raw, kind: 'png' }
  if (raw[0] === 0xff && raw[1] === 0xd8) return { bytes: raw, kind: 'jpg' }
  // Decode WebP/GIF/BMP via ImageBitmap + Canvas
  const bmp = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image conversion failed'))), 'image/png'),
    )
    canvas.width = 0
    canvas.height = 0
    return { bytes: new Uint8Array(await pngBlob.arrayBuffer()), kind: 'png' }
  } finally {
    bmp.close()
  }
}

export async function imagesToPdf(files: File[], opts: ImagesToPdfOptions): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const bg = hexToRgb(opts.bgColor)

  for (let i = 0; i < files.length; i++) {
    const { bytes, kind } = await normalizeImageForPdf(files[i])
    const img = kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    let pw: number
    let ph: number
    if (opts.pageSize === 'fit') {
      pw = img.width + opts.margin * 2
      ph = img.height + opts.margin * 2
    } else {
      const base =
        opts.pageSize === 'custom'
          ? { width: opts.customWidth || 595.28, height: opts.customHeight || 841.89 }
          : PAGE_SIZES[opts.pageSize]
      pw = opts.orientation === 'landscape' ? Math.max(base.width, base.height) : Math.min(base.width, base.height)
      ph = opts.orientation === 'landscape' ? Math.min(base.width, base.height) : Math.max(base.width, base.height)
    }

    const page = doc.addPage([pw, ph])
    if (opts.bgColor && opts.bgColor.toLowerCase() !== '#ffffff') {
      page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: bg })
    }

    const availW = Math.max(10, pw - opts.margin * 2)
    const availH = Math.max(10, ph - opts.margin * 2)
    const scale =
      opts.fitMode === 'fill'
        ? Math.max(availW / img.width, availH / img.height)
        : Math.min(availW / img.width, availH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const x = (pw - dw) / 2
    const y = opts.align === 'top' ? ph - opts.margin - dh : (ph - dh) / 2
    page.drawImage(img, { x, y, width: dw, height: dh })
    opts.onProgress?.((i + 1) / files.length)
  }

  doc.setProducer('PaperFlow AI')
  return savePdf(doc)
}

export interface PdfToImagesOptions {
  format: 'png' | 'jpeg' | 'webp'
  dpi: number
  quality: number
  pages?: number[]
  password?: string
  signal?: AbortSignal
  onProgress?: (p: number) => void
}

export async function pdfToImages(file: File, opts: PdfToImagesOptions): Promise<OutputFile[]> {
  const pdf = await openPdf(file, { password: opts.password })
  const indices = opts.pages?.length ? opts.pages : Array.from({ length: pdf.numPages }, (_, i) => i)
  const mime = opts.format === 'png' ? 'image/png' : opts.format === 'webp' ? 'image/webp' : 'image/jpeg'
  const ext = opts.format === 'jpeg' ? 'jpg' : opts.format
  const stem = baseName(file.name)
  const scale = opts.dpi / 72
  const outputs: OutputFile[] = []

  try {
    for (let i = 0; i < indices.length; i++) {
      throwIfAborted(opts.signal)
      const pIdx = indices[i]
      const page = await pdf.getPage(pIdx + 1)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(vp.width))
      canvas.height = Math.max(1, Math.floor(vp.height))
      const ctx = canvas.getContext('2d', { alpha: opts.format === 'png' })!
      if (opts.format !== 'png') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${opts.format}`))),
          mime,
          opts.format === 'png' ? undefined : opts.quality,
        ),
      )
      canvas.width = 0
      canvas.height = 0
      outputs.push({ name: `${stem}-page-${pIdx + 1}.${ext}`, blob })
      opts.onProgress?.((i + 1) / indices.length)
    }
    return outputs
  } finally {
    await closePdf(pdf)
  }
}

export interface UnicodeTextSpan {
  text: string
  /** Normalized 0..1 coordinates (top-left origin) */
  x: number
  y: number
  w: number
  h: number
  /** Font size in PDF points (scale = 1) */
  fontSize: number
}

/** Transient side-channel map from converted File → per-page Unicode selectable text spans. */
export const convertedTextLayers = new WeakMap<File, UnicodeTextSpan[][]>()

const UNICODE_FONT_STACK =
  "'Noto Sans Bengali', 'Hind Siliguri', 'Nirmala UI', 'Vrinda', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO_FONT_STACK = "ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace"

function hasNonWinAnsi(text: string) {
  return /[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/.test(text) // eslint-disable-line no-control-regex
}

/**
 * Browser-native Canvas 2D renderer for Unicode (Bangla, Arabic, Hindi, CJK, Emoji)
 * Markdown & plain text documents. Uses the OS text shaper (HarfBuzz/DirectWrite)
 * so Bengali conjuncts (যুক্তবর্ণ) and vowel signs (কার) render 100% accurately,
 * and records exact line coordinates so every word is selectable & highlightable in Workspace.
 */
async function renderUnicodeDocToPdf(
  content: string,
  opts: { isMarkdown: boolean; title?: string; pageSize?: 'a4' | 'letter'; margin?: number },
): Promise<{ bytes: Uint8Array; textPages: UnicodeTextSpan[][] }> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const size = PAGE_SIZES[opts.pageSize ?? 'a4']
  const scale = 2 // 144 DPI crisp rendering
  const pageW = Math.round(size.width * scale)
  const pageH = Math.round(size.height * scale)
  const margin = Math.round((opts.margin ?? 46) * scale)
  const maxW = pageW - margin * 2

  const canvas = document.createElement('canvas')
  canvas.width = pageW
  canvas.height = pageH
  const ctx = canvas.getContext('2d', { alpha: false })!

  let y = margin
  let pageDirty = false
  const textPages: UnicodeTextSpan[][] = []
  let curPageSpans: UnicodeTextSpan[] = []

  const drawTrackedText = (text: string, xPx: number, yPx: number, fontSizePx: number) => {
    if (!text) return
    ctx.fillText(text, xPx, yPx)
    const measuredW = ctx.measureText(text).width
    curPageSpans.push({
      text,
      x: xPx / pageW,
      y: yPx / pageH,
      w: Math.min(1 - xPx / pageW, measuredW / pageW),
      h: (fontSizePx * 1.25) / pageH,
      fontSize: fontSizePx / scale,
    })
  }

  const startNewPage = () => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageW, pageH)
    y = margin
    pageDirty = false
    curPageSpans = []
  }

  const flushPage = async () => {
    if (!pageDirty) return
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))), 'image/jpeg', 0.92),
    )
    const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const p = doc.addPage([size.width, size.height])
    p.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height })
    textPages.push(curPageSpans)
    startNewPage()
  }

  const ensureSpace = async (needed: number) => {
    if (y + needed > pageH - margin) {
      await flushPage()
    }
  }

  const wrapCanvasText = (text: string, font: string, width: number): string[] => {
    ctx.font = font
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (ctx.measureText(test).width <= width) {
        cur = test
      } else {
        if (cur) lines.push(cur)
        // If single word exceeds line width, split by characters
        if (ctx.measureText(w).width > width) {
          let chunk = ''
          for (const ch of Array.from(w)) {
            if (ctx.measureText(chunk + ch).width > width && chunk) {
              lines.push(chunk)
              chunk = ch
            } else {
              chunk += ch
            }
          }
          cur = chunk
        } else {
          cur = w
        }
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  const cleanInlineMd = (s: string) =>
    s
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')

  startNewPage()
  ctx.textBaseline = 'top'

  if (!opts.isMarkdown && opts.title?.trim()) {
    const font = `700 ${17 * scale}px ${UNICODE_FONT_STACK}`
    ctx.font = font
    ctx.fillStyle = '#18181b'
    for (const l of wrapCanvasText(opts.title, font, maxW)) {
      await ensureSpace(24 * scale)
      drawTrackedText(l, margin, y, 17 * scale)
      y += 23 * scale
      pageDirty = true
    }
    y += 10 * scale
  }

  const rawLines = content.replace(/\r\n/g, '\n').split('\n')
  let inCode = false
  let codeLines: string[] = []

  const flushCode = async () => {
    if (!codeLines.length) return
    const fontSize = 9.5 * scale
    const lh = 14 * scale
    const font = `400 ${fontSize}px ${MONO_FONT_STACK}`
    const wrapped: string[] = []
    ctx.font = font
    for (const cl of codeLines) {
      const expanded = cl.replace(/\t/g, '  ')
      if (!expanded) {
        wrapped.push('')
        continue
      }
      let cur = ''
      for (const ch of Array.from(expanded)) {
        if (ctx.measureText(cur + ch).width > maxW - 24 * scale && cur) {
          wrapped.push(cur)
          cur = ch
        } else {
          cur += ch
        }
      }
      if (cur) wrapped.push(cur)
    }
    const pad = 10 * scale
    let idx = 0
    while (idx < wrapped.length) {
      const avail = pageH - margin - y - pad * 2
      const fit = Math.max(1, Math.floor(avail / lh))
      if (avail < lh + pad * 2) {
        await flushPage()
        continue
      }
      const slice = wrapped.slice(idx, idx + fit)
      const boxH = slice.length * lh + pad * 2
      ctx.fillStyle = '#f4f6fa'
      ctx.fillRect(margin, y, maxW, boxH)
      ctx.strokeStyle = '#dce1ec'
      ctx.lineWidth = scale * 0.75
      ctx.strokeRect(margin, y, maxW, boxH)
      ctx.font = font
      ctx.fillStyle = '#1e293b'
      slice.forEach((l, i) => {
        if (l) drawTrackedText(l, margin + 12 * scale, y + pad + i * lh, fontSize)
      })
      y += boxH + 10 * scale
      pageDirty = true
      idx += slice.length
    }
    codeLines = []
  }

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]
    const trimmed = raw.trim()

    if (opts.isMarkdown && trimmed.startsWith('```')) {
      if (inCode) {
        await flushCode()
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeLines.push(raw)
      continue
    }

    if (!trimmed) {
      y += 8 * scale
      continue
    }

    // Markdown table block
    if (opts.isMarkdown && trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[][] = []
      while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
        const rowStr = rawLines[i].trim()
        if (!/^\|[\s:-]+\|$/.test(rowStr.replace(/\|/g, '|').replace(/[^|:\s-]/g, 'x'))) {
          const cells = rowStr
            .slice(1, rowStr.endsWith('|') ? -1 : undefined)
            .split('|')
            .map((c) => cleanInlineMd(c.trim()))
          tableRows.push(cells)
        }
        i++
      }
      i--
      if (tableRows.length > 0) {
        const cols = Math.max(...tableRows.map((r) => r.length))
        const colW = maxW / Math.max(1, cols)
        const cellPad = 6 * scale
        const fontSize = 9.5 * scale
        const lh = 13.5 * scale

        for (let ri = 0; ri < tableRows.length; ri++) {
          const row = tableRows[ri]
          const isHeader = ri === 0
          const font = `${isHeader ? 700 : 400} ${fontSize}px ${UNICODE_FONT_STACK}`
          const wrappedCells = Array.from({ length: cols }, (_, ci) =>
            wrapCanvasText(row[ci] ?? '', font, Math.max(24, colW - cellPad * 2)),
          )
          const maxLines = Math.max(1, ...wrappedCells.map((wc) => wc.length))
          const rowH = maxLines * lh + cellPad * 2
          await ensureSpace(rowH)
          if (isHeader) {
            ctx.fillStyle = '#eef2ff'
            ctx.fillRect(margin, y, maxW, rowH)
          }
          ctx.strokeStyle = '#d4d8e2'
          ctx.lineWidth = scale * 0.6
          ctx.strokeRect(margin, y, maxW, rowH)
          ctx.font = font
          ctx.fillStyle = isHeader ? '#1e293b' : '#27272a'
          for (let ci = 0; ci < cols; ci++) {
            const cx = margin + ci * colW
            if (ci > 0) {
              ctx.beginPath()
              ctx.moveTo(cx, y)
              ctx.lineTo(cx, y + rowH)
              ctx.stroke()
            }
            wrappedCells[ci].forEach((line, li) => {
              drawTrackedText(line, cx + cellPad, y + cellPad + li * lh, fontSize)
            })
          }
          y += rowH
          pageDirty = true
        }
        y += 10 * scale
        continue
      }
    }

    // Horizontal rule
    if (opts.isMarkdown && /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      await ensureSpace(14 * scale)
      ctx.strokeStyle = '#d4d8e2'
      ctx.lineWidth = scale
      ctx.beginPath()
      ctx.moveTo(margin, y + 6 * scale)
      ctx.lineTo(pageW - margin, y + 6 * scale)
      ctx.stroke()
      y += 14 * scale
      pageDirty = true
      continue
    }

    // Headings
    const headingMatch = opts.isMarkdown ? /^(#{1,4})\s+(.*)$/.exec(trimmed) : null
    if (headingMatch) {
      const level = headingMatch[1].length
      const fontSize = (level === 1 ? 19 : level === 2 ? 15.5 : level === 3 ? 13 : 11.5) * scale
      const lh = fontSize * 1.38
      const font = `700 ${fontSize}px ${UNICODE_FONT_STACK}`
      const lines = wrapCanvasText(cleanInlineMd(headingMatch[2]), font, maxW)
      y += (level === 1 ? 8 : 6) * scale
      await ensureSpace(lines.length * lh + 8 * scale)
      ctx.font = font
      ctx.fillStyle = level <= 2 ? '#1e293b' : '#334155'
      for (const l of lines) {
        drawTrackedText(l, margin, y, fontSize)
        y += lh
        pageDirty = true
      }
      if (level <= 2) {
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = level === 1 ? scale : scale * 0.6
        ctx.beginPath()
        ctx.moveTo(margin, y + 2 * scale)
        ctx.lineTo(pageW - margin, y + 2 * scale)
        ctx.stroke()
        y += 8 * scale
      }
      continue
    }

    // Blockquote
    const quoteMatch = opts.isMarkdown ? /^>\s?(.*)$/.exec(trimmed) : null
    if (quoteMatch) {
      const fontSize = 10.5 * scale
      const lh = 16 * scale
      const font = `italic 400 ${fontSize}px ${UNICODE_FONT_STACK}`
      const lines = wrapCanvasText(cleanInlineMd(quoteMatch[1]), font, maxW - 18 * scale)
      await ensureSpace(lines.length * lh + 4 * scale)
      const topY = y
      ctx.font = font
      ctx.fillStyle = '#475569'
      for (const l of lines) {
        drawTrackedText(l, margin + 14 * scale, y, fontSize)
        y += lh
        pageDirty = true
      }
      ctx.fillStyle = '#4f46e5'
      ctx.fillRect(margin + 2 * scale, topY, 3 * scale, Math.max(lh, y - topY - 2 * scale))
      y += 4 * scale
      continue
    }

    // Bullet or numbered list
    const listMatch = opts.isMarkdown ? /^([-*+]|\d+\.|[০-৯]+\.)\s+(.*)$/.exec(trimmed) : null
    if (listMatch) {
      const marker = /^[-*+]$/.test(listMatch[1]) ? '•' : listMatch[1]
      const fontSize = 10.5 * scale
      const lh = 16.5 * scale
      const font = `400 ${fontSize}px ${UNICODE_FONT_STACK}`
      const lines = wrapCanvasText(cleanInlineMd(listMatch[2]), font, maxW - 22 * scale)
      await ensureSpace(lines.length * lh + 2 * scale)
      ctx.font = `700 ${fontSize}px ${UNICODE_FONT_STACK}`
      ctx.fillStyle = '#334155'
      ctx.fillText(marker, margin + 4 * scale, y)
      ctx.font = font
      ctx.fillStyle = '#18181b'
      for (const l of lines) {
        drawTrackedText(l, margin + 20 * scale, y, fontSize)
        y += lh
        pageDirty = true
      }
      y += 3 * scale
      continue
    }

    // Regular paragraph
    const fontSize = 10.5 * scale
    const lh = 16.5 * scale
    const isBoldPara = opts.isMarkdown && /^\*\*[^*]+\*\*$/.test(trimmed)
    const font = `${isBoldPara ? 700 : 400} ${fontSize}px ${UNICODE_FONT_STACK}`
    const lines = wrapCanvasText(opts.isMarkdown ? cleanInlineMd(trimmed) : trimmed, font, maxW)
    ctx.font = font
    ctx.fillStyle = '#18181b'
    for (const l of lines) {
      await ensureSpace(lh)
      drawTrackedText(l, margin, y, fontSize)
      y += lh
      pageDirty = true
    }
    y += 4 * scale
  }

  if (inCode) await flushCode()
  await flushPage()

  canvas.width = 0
  canvas.height = 0
  if (doc.getPageCount() === 0) doc.addPage([size.width, size.height])
  if (opts.title) doc.setTitle(opts.title)
  doc.setProducer('PaperFlow AI')
  return { bytes: await savePdf(doc), textPages }
}

/** Convert plain text to a cleanly wrapped multi-page PDF. */
export async function textToPdf(
  text: string,
  opts: { title?: string; fontSize?: number; pageSize?: 'a4' | 'letter'; margin?: number } = {},
): Promise<Uint8Array> {
  if (typeof document !== 'undefined' && hasNonWinAnsi(text + (opts.title ?? ''))) {
    const { bytes } = await renderUnicodeDocToPdf(text, {
      isMarkdown: false,
      title: opts.title,
      pageSize: opts.pageSize,
      margin: opts.margin,
    })
    return bytes
  }
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = PAGE_SIZES[opts.pageSize ?? 'a4']
  const margin = opts.margin ?? 48
  const fontSize = opts.fontSize ?? 11
  const lineHeight = fontSize * 1.45
  const maxWidth = size.width - margin * 2

  // eslint-disable-next-line no-control-regex
  const safe = text.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')
  const rawParagraphs = safe.split(/\r?\n/)
  const lines: string[] = []

  for (const para of rawParagraphs) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    const words = para.split(/\s+/)
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        cur = test
      } else {
        if (cur) lines.push(cur)
        cur = w
      }
    }
    if (cur) lines.push(cur)
  }

  let page = doc.addPage([size.width, size.height])
  let y = size.height - margin

  if (opts.title?.trim()) {
    const t = opts.title.replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    page.drawText(t, { x: margin, y, size: fontSize + 5, font: boldFont, color: rgb(0.1, 0.1, 0.15) })
    y -= (fontSize + 5) * 1.8
  }

  for (const line of lines) {
    if (y < margin + lineHeight) {
      page = doc.addPage([size.width, size.height])
      y = size.height - margin
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.15, 0.15, 0.18) })
    }
    y -= lineHeight
  }

  doc.setProducer('PaperFlow AI')
  if (opts.title) doc.setTitle(opts.title)
  return savePdf(doc)
}

/** Convert simple HTML into a PDF by extracting structured text/headings locally. */
export async function htmlToPdf(html: string, title = 'HTML Document'): Promise<Uint8Array> {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  dom.querySelectorAll('script,style,noscript').forEach((n) => n.remove())
  const blocks: string[] = []
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const t = el.textContent?.trim()
      if (t) blocks.push(`\n${t.toUpperCase()}\n`)
      return
    }
    if (tag === 'p' || tag === 'li' || tag === 'blockquote' || tag === 'tr') {
      const t = el.textContent?.replace(/\s+/g, ' ').trim()
      if (t) blocks.push(tag === 'li' ? `• ${t}` : t)
      return
    }
    if (el.children.length === 0) {
      const t = el.textContent?.trim()
      if (t) blocks.push(t)
      return
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(dom.body)
  const plain = blocks.length ? blocks.join('\n\n') : (dom.body.textContent ?? '').trim()
  return textToPdf(plain || '(Empty HTML document)', { title })
}

/**
 * Convert DOCX to PDF locally using mammoth (extracts clean text & structure).
 * Complex Word layouts (floating shapes, footnotes, equations) are simplified to clean text flow.
 */
export async function docxToPdf(file: File): Promise<Uint8Array> {
  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  return textToPdf(value || '(No readable text in DOCX)', { title: baseName(file.name) })
}

/**
 * Convert Markdown (.md) to a cleanly formatted multi-page PDF locally
 * with headings, lists, blockquotes, horizontal rules, and shaded code blocks.
 */
export async function markdownToPdf(
  markdown: string,
  opts: { title?: string; pageSize?: 'a4' | 'letter'; margin?: number } = {},
): Promise<Uint8Array> {
  // Use browser-native Canvas 2D text shaper whenever Unicode (Bangla, Arabic, Hindi, CJK, emoji)
  // or Markdown tables are present so every glyph renders accurately with zero "????" boxes.
  const hasTables = /^\|.+\|$/m.test(markdown)
  if (typeof document !== 'undefined' && (hasNonWinAnsi(markdown + (opts.title ?? '')) || hasTables)) {
    const { bytes } = await renderUnicodeDocToPdf(markdown, {
      isMarkdown: true,
      title: opts.title,
      pageSize: opts.pageSize,
      margin: opts.margin,
    })
    return bytes
  }
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const size = PAGE_SIZES[opts.pageSize ?? 'a4']
  const margin = opts.margin ?? 50
  const maxWidth = size.width - margin * 2

  let page = doc.addPage([size.width, size.height])
  let y = size.height - margin

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage([size.width, size.height])
      y = size.height - margin
    }
  }

  const sanitize = (s: string) =>
    // eslint-disable-next-line no-control-regex
    s.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')

  const stripInlineMd = (s: string) =>
    sanitize(
      s
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1'),
    )

  const wrap = (text: string, font: typeof regular, fontSize: number, width: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const out: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(test, fontSize) <= width) {
        cur = test
      } else {
        if (cur) out.push(cur)
        cur = w
      }
    }
    if (cur) out.push(cur)
    return out
  }

  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n')
  let inCode = false
  let codeLines: string[] = []

  const flushCode = () => {
    if (codeLines.length === 0) return
    const fontSize = 9.5
    const lh = 13.5
    const wrapped: string[] = []
    for (const cl of codeLines) {
      const clean = sanitize(cl).replace(/\t/g, '  ')
      if (!clean) {
        wrapped.push('')
        continue
      }
      // Hard-wrap long code lines to fit inside box
      let rem = clean
      while (rem.length > 0) {
        let cut = rem.length
        while (cut > 1 && mono.widthOfTextAtSize(rem.slice(0, cut), fontSize) > maxWidth - 20) cut--
        wrapped.push(rem.slice(0, cut))
        rem = rem.slice(cut)
      }
    }
    const boxH = wrapped.length * lh + 14
    ensureSpace(Math.min(boxH, size.height - margin * 2))
    const startY = y
    let drawY = y - 14
    const drawLinesOnPage: string[] = []
    const flushPageBox = (topY: number, lines: string[]) => {
      if (!lines.length) return
      const h = lines.length * lh + 12
      page.drawRectangle({
        x: margin,
        y: topY - h,
        width: maxWidth,
        height: h,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.86, 0.88, 0.92),
        borderWidth: 0.75,
      })
      lines.forEach((l, idx) => {
        if (l) {
          page.drawText(l, {
            x: margin + 10,
            y: topY - 14 - idx * lh,
            size: fontSize,
            font: mono,
            color: rgb(0.15, 0.18, 0.24),
          })
        }
      })
    }

    let boxTop = startY
    for (const wl of wrapped) {
      if (drawY < margin + 16) {
        flushPageBox(boxTop, drawLinesOnPage)
        drawLinesOnPage.length = 0
        page = doc.addPage([size.width, size.height])
        y = size.height - margin
        boxTop = y
        drawY = y - 14
      }
      drawLinesOnPage.push(wl)
      drawY -= lh
    }
    flushPageBox(boxTop, drawLinesOnPage)
    y = drawY - 10
    codeLines = []
  }

  for (const raw of rawLines) {
    const trimmed = raw.trim()

    if (trimmed.startsWith('```')) {
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeLines.push(raw)
      continue
    }

    if (!trimmed) {
      y -= 8
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensureSpace(14)
      page.drawLine({
        start: { x: margin, y: y - 4 },
        end: { x: size.width - margin, y: y - 4 },
        thickness: 0.75,
        color: rgb(0.82, 0.84, 0.88),
      })
      y -= 16
      continue
    }

    // Headings (# .. ####)
    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = stripInlineMd(headingMatch[2])
      const fontSize = level === 1 ? 20 : level === 2 ? 16 : level === 3 ? 13.5 : 12
      const lh = fontSize * 1.35
      const lines = wrap(text, bold, fontSize, maxWidth)
      y -= level === 1 ? 8 : 6
      ensureSpace(lines.length * lh + 10)
      for (const l of lines) {
        page.drawText(l, {
          x: margin,
          y: y - fontSize,
          size: fontSize,
          font: bold,
          color: level <= 2 ? rgb(0.11, 0.14, 0.24) : rgb(0.18, 0.2, 0.28),
        })
        y -= lh
      }
      if (level <= 2) {
        page.drawLine({
          start: { x: margin, y: y + 2 },
          end: { x: size.width - margin, y: y + 2 },
          thickness: level === 1 ? 1 : 0.5,
          color: rgb(0.86, 0.88, 0.93),
        })
        y -= 6
      }
      continue
    }

    // Blockquote
    const quoteMatch = /^>\s?(.*)$/.exec(trimmed)
    if (quoteMatch) {
      const fontSize = 10.5
      const lh = 15
      const lines = wrap(stripInlineMd(quoteMatch[1]), italic, fontSize, maxWidth - 18)
      ensureSpace(lines.length * lh + 4)
      const topY = y
      for (const l of lines) {
        page.drawText(l, {
          x: margin + 14,
          y: y - fontSize,
          size: fontSize,
          font: italic,
          color: rgb(0.35, 0.38, 0.45),
        })
        y -= lh
      }
      page.drawRectangle({
        x: margin + 2,
        y: y + 2,
        width: 2.5,
        height: Math.max(lh, topY - y - 2),
        color: rgb(0.31, 0.27, 0.9),
      })
      y -= 4
      continue
    }

    // Bullet or numbered list item
    const listMatch = /^([-*+]|\d+\.)\s+(.*)$/.exec(trimmed)
    if (listMatch) {
      const marker = /^\d+\./.test(listMatch[1]) ? listMatch[1] : '•'
      const fontSize = 10.5
      const lh = 15.5
      const lines = wrap(stripInlineMd(listMatch[2]), regular, fontSize, maxWidth - 20)
      ensureSpace(lines.length * lh + 2)
      page.drawText(marker, {
        x: margin + 4,
        y: y - fontSize,
        size: fontSize,
        font: bold,
        color: rgb(0.25, 0.28, 0.36),
      })
      for (const l of lines) {
        page.drawText(l, {
          x: margin + 18,
          y: y - fontSize,
          size: fontSize,
          font: regular,
          color: rgb(0.15, 0.16, 0.2),
        })
        y -= lh
      }
      y -= 2
      continue
    }

    // Regular paragraph line
    const fontSize = 10.5
    const lh = 15.5
    const lines = wrap(stripInlineMd(trimmed), regular, fontSize, maxWidth)
    for (const l of lines) {
      ensureSpace(lh)
      page.drawText(l, {
        x: margin,
        y: y - fontSize,
        size: fontSize,
        font: regular,
        color: rgb(0.15, 0.16, 0.2),
      })
      y -= lh
    }
    y -= 4
  }

  if (inCode) flushCode()
  if (opts.title) doc.setTitle(opts.title)
  doc.setProducer('PaperFlow AI')
  return savePdf(doc)
}

export const ACCEPTED_UNIVERSAL_FILES =
  '.pdf,application/pdf,image/png,image/jpeg,image/webp,.md,.markdown,text/markdown,.txt,text/plain,.html,.htm,text/html,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Universally convert any supported file (Image, Markdown, TXT, HTML, DOCX) into a PDF File
 * so it can open directly in the PDF Workspace without redirecting the user to a separate page.
 */
export async function ensurePdfFile(file: File): Promise<{ file: File; converted: boolean }> {
  const lower = file.name.toLowerCase()
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    return { file, converted: false }
  }

  const outName = `${baseName(file.name)}.pdf`
  let bytes: Uint8Array
  let textPages: UnicodeTextSpan[][] | undefined

  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower)) {
    bytes = await imagesToPdf([file], {
      pageSize: 'a4',
      orientation: 'portrait',
      margin: 24,
      fitMode: 'fit',
      align: 'center',
      bgColor: '#ffffff',
    })
  } else if (lower.endsWith('.md') || lower.endsWith('.markdown') || file.type === 'text/markdown') {
    const md = await file.text()
    const hasTables = /^\|.+\|$/m.test(md)
    if (typeof document !== 'undefined' && (hasNonWinAnsi(md + file.name) || hasTables)) {
      const res = await renderUnicodeDocToPdf(md, { isMarkdown: true, title: baseName(file.name) })
      bytes = res.bytes
      textPages = res.textPages
    } else {
      bytes = await markdownToPdf(md, { title: baseName(file.name) })
    }
  } else if (lower.endsWith('.html') || lower.endsWith('.htm') || file.type === 'text/html') {
    const html = await file.text()
    bytes = await htmlToPdf(html, baseName(file.name))
  } else if (
    lower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    bytes = await docxToPdf(file)
  } else if (lower.endsWith('.txt') || file.type.startsWith('text/')) {
    const txt = await file.text()
    if (typeof document !== 'undefined' && hasNonWinAnsi(txt + file.name)) {
      const res = await renderUnicodeDocToPdf(txt, { isMarkdown: false, title: baseName(file.name) })
      bytes = res.bytes
      textPages = res.textPages
    } else {
      bytes = await textToPdf(txt, { title: baseName(file.name) })
    }
  } else {
    throw new Error(`Unsupported file format: "${file.name}". Supported: PDF, PNG, JPG, WebP, MD, TXT, HTML, DOCX.`)
  }

  const outFile = new File([bytes as BlobPart], outName, { type: 'application/pdf', lastModified: Date.now() })
  if (textPages) convertedTextLayers.set(outFile, textPages)
  return { file: outFile, converted: true }
}
