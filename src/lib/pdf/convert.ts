import { rgb, StandardFonts } from '@cantoo/pdf-lib'
import { loadPdfLib, savePdf } from './pdflib'
import { openPdf } from './pdfjs'
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
    await pdf.destroy()
  }
}

/** Convert plain text to a cleanly wrapped multi-page PDF. */
export async function textToPdf(
  text: string,
  opts: { title?: string; fontSize?: number; pageSize?: 'a4' | 'letter'; margin?: number } = {},
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = PAGE_SIZES[opts.pageSize ?? 'a4']
  const margin = opts.margin ?? 48
  const fontSize = opts.fontSize ?? 11
  const lineHeight = fontSize * 1.45
  const maxWidth = size.width - margin * 2

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
