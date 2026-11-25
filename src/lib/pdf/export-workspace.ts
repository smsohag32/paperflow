import { degrees, rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from '@cantoo/pdf-lib'
import type { Annotation, FontFamily, WorkspaceDoc, WorkspacePage } from '@/types/workspace'
import { loadPdfDoc, loadPdfLib, savePdf } from './pdflib'
import { getAsset, getLibraryBlob } from '@/lib/storage/repo'
import { closePdf, openPdf } from './pdfjs'
import { parsePageRange } from './page-range'

function hexToRgb(hex?: string) {
  if (!hex || hex === 'transparent') return null
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (full.length !== 6) return rgb(0, 0, 0)
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return rgb(Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0)
}

function pickFont(family: FontFamily, bold?: boolean, italic?: boolean) {
  if (family === 'TimesRoman') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (family === 'Courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

/**
 * Strip characters unsupported by WinAnsi standard fonts so pdf-lib never throws
 * on Unicode input (replaces unsupported glyphs safely).
 */
function safeWinAnsi(text: string): string {
  // Standard PDF WinAnsi covers printable ASCII + Latin-1 supplement (0x20-0xFF)
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')
}

async function renderRedactedPageAsImage(
  sourceBlob: Blob,
  sourcePageIndex: number,
  page: WorkspacePage,
  password?: string,
): Promise<Uint8Array> {
  const pdf = await openPdf(sourceBlob, { password })
  try {
    const p = await pdf.getPage(sourcePageIndex + 1)
    const scale = 2 // 144 DPI crisp rasterization for permanent redaction
    const vp = p.getViewport({ scale, rotation: page.rotation })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(vp.width))
    canvas.height = Math.max(1, Math.floor(vp.height))
    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await p.render({ canvas, canvasContext: ctx, viewport: vp }).promise

    // Permanently paint over every redaction box on the rasterized pixels
    for (const ann of page.annotations) {
      if (ann.type !== 'redact') continue
      ctx.fillStyle = ann.color || '#000000'
      ctx.fillRect(
        ann.x * canvas.width,
        ann.y * canvas.height,
        ann.w * canvas.width,
        ann.h * canvas.height,
      )
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode redacted page'))), 'image/jpeg', 0.92),
    )
    canvas.width = 0
    canvas.height = 0
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    await closePdf(pdf)
  }
}

async function drawAnnotation(
  outDoc: PDFDocument,
  pdfPage: PDFPage,
  ann: Annotation,
  fontCache: Map<string, PDFFont>,
) {
  const { width: pw, height: ph } = pdfPage.getSize()
  const x = ann.x * pw
  const w = ann.w * pw
  const h = ann.h * ph
  // Convert top-left normalized Y to PDF bottom-left Y
  const yTop = ph - ann.y * ph
  const yBottom = yTop - h
  const opacity = ann.opacity ?? 1

  const getFont = async (name: StandardFonts) => {
    let f = fontCache.get(name)
    if (!f) {
      f = await outDoc.embedFont(name)
      fontCache.set(name, f)
    }
    return f
  }

  switch (ann.type) {
    case 'text': {
      const bg = hexToRgb(ann.bgColor)
      if (bg) {
        pdfPage.drawRectangle({ x, y: yBottom, width: w, height: h, color: bg, opacity })
      }
      const font = await getFont(pickFont(ann.fontFamily, ann.bold, ann.italic))
      const color = hexToRgb(ann.color) ?? rgb(0, 0, 0)
      const lines = safeWinAnsi(ann.text).split('\n')
      const lineHeight = ann.fontSize * 1.25
      lines.forEach((line, idx) => {
        const tw = font.widthOfTextAtSize(line, ann.fontSize)
        let tx = x + 2
        if (ann.align === 'center') tx = x + Math.max(0, (w - tw) / 2)
        else if (ann.align === 'right') tx = x + Math.max(0, w - tw - 2)
        const ty = yTop - ann.fontSize - idx * lineHeight
        pdfPage.drawText(line, { x: tx, y: ty, size: ann.fontSize, font, color, opacity })
        if (ann.underline) {
          pdfPage.drawLine({
            start: { x: tx, y: ty - 2 },
            end: { x: tx + tw, y: ty - 2 },
            thickness: Math.max(0.75, ann.fontSize / 16),
            color,
            opacity,
          })
        }
      })
      break
    }

    case 'highlight': {
      const color = hexToRgb(ann.color) ?? rgb(1, 0.92, 0.23)
      pdfPage.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color,
        opacity: ann.opacity ?? 0.35,
      })
      break
    }

    case 'underline': {
      const color = hexToRgb(ann.color) ?? rgb(0.95, 0.65, 0.1)
      pdfPage.drawLine({
        start: { x, y: yBottom + 1 },
        end: { x: x + w, y: yBottom + 1 },
        thickness: 1.5,
        color,
        opacity,
      })
      break
    }

    case 'strike': {
      const color = hexToRgb(ann.color) ?? rgb(0.9, 0.2, 0.2)
      const midY = yBottom + h / 2
      pdfPage.drawLine({
        start: { x, y: midY },
        end: { x: x + w, y: midY },
        thickness: 1.5,
        color,
        opacity,
      })
      break
    }

    case 'rect': {
      const borderColor = hexToRgb(ann.stroke) ?? rgb(0.15, 0.25, 0.8)
      const fillColor = hexToRgb(ann.fill)
      pdfPage.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        borderColor,
        borderWidth: ann.strokeWidth,
        color: fillColor ?? undefined,
        opacity: fillColor ? opacity : undefined,
        borderOpacity: opacity,
      })
      break
    }

    case 'circle': {
      const borderColor = hexToRgb(ann.stroke) ?? rgb(0.15, 0.25, 0.8)
      const fillColor = hexToRgb(ann.fill)
      pdfPage.drawEllipse({
        x: x + w / 2,
        y: yBottom + h / 2,
        xScale: Math.max(1, w / 2),
        yScale: Math.max(1, h / 2),
        borderColor,
        borderWidth: ann.strokeWidth,
        color: fillColor ?? undefined,
        opacity: fillColor ? opacity : undefined,
        borderOpacity: opacity,
      })
      break
    }

    case 'line':
    case 'arrow': {
      const color = hexToRgb(ann.stroke) ?? rgb(0.15, 0.25, 0.8)
      const start = { x, y: yTop }
      const end = { x: x + w, y: yBottom }
      pdfPage.drawLine({ start, end, thickness: ann.strokeWidth, color, opacity })
      if (ann.type === 'arrow') {
        const angle = Math.atan2(end.y - start.y, end.x - start.x)
        const head = Math.max(8, ann.strokeWidth * 4)
        for (const offset of [2.55, -2.55]) {
          pdfPage.drawLine({
            start: end,
            end: {
              x: end.x + Math.cos(angle + offset) * head,
              y: end.y + Math.sin(angle + offset) * head,
            },
            thickness: ann.strokeWidth,
            color,
            opacity,
          })
        }
      }
      break
    }

    case 'draw': {
      const color = hexToRgb(ann.stroke) ?? rgb(0.1, 0.1, 0.1)
      for (let i = 1; i < ann.points.length; i++) {
        const p0 = ann.points[i - 1]
        const p1 = ann.points[i]
        pdfPage.drawLine({
          start: { x: p0.x * pw, y: ph - p0.y * ph },
          end: { x: p1.x * pw, y: ph - p1.y * ph },
          thickness: ann.strokeWidth,
          color,
          opacity,
        })
      }
      break
    }

    case 'note': {
      const bg = hexToRgb(ann.color) ?? rgb(0.99, 0.94, 0.54)
      pdfPage.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color: bg,
        borderColor: rgb(0.75, 0.65, 0.15),
        borderWidth: 0.75,
        opacity: 0.92,
      })
      const font = await getFont(StandardFonts.Helvetica)
      const lines = safeWinAnsi(ann.text).split('\n').slice(0, 6)
      lines.forEach((line, idx) => {
        pdfPage.drawText(line.slice(0, 60), {
          x: x + 5,
          y: yTop - 13 - idx * 11,
          size: 9,
          font,
          color: rgb(0.15, 0.15, 0.15),
        })
      })
      break
    }

    case 'image':
    case 'signature': {
      const blob = await getAsset(ann.assetId)
      if (!blob) break
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const isPng = blob.type.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50)
      const img = isPng ? await outDoc.embedPng(bytes) : await outDoc.embedJpg(bytes)
      pdfPage.drawImage(img, {
        x,
        y: yBottom,
        width: w,
        height: h,
        opacity,
        rotate: ann.rotation ? degrees(-ann.rotation) : undefined,
      })
      break
    }

    case 'redact': {
      // Handled permanently during page rasterization above; fallback rectangle for blank pages
      pdfPage.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color: hexToRgb(ann.color) ?? rgb(0, 0, 0),
      })
      break
    }
  }
}

/**
 * Export a WorkspaceDoc (or selected page IDs) into a real PDF Uint8Array.
 */
export async function exportWorkspacePdf(
  doc: WorkspaceDoc,
  opts: { pageIds?: string[]; onProgress?: (p: number) => void } = {},
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  const fontCache = new Map<string, PDFFont>()
  const sourceDocs = new Map<string, PDFDocument>()
  const sourceBlobs = new Map<string, Blob>()

  const pages = opts.pageIds?.length
    ? doc.pages.filter((p) => opts.pageIds!.includes(p.id))
    : doc.pages

  if (pages.length === 0) throw new Error('No pages to export.')

  // Determine which pages get page numbers
  let numberedSet: Set<number> | null = null
  if (doc.pageNumbers.enabled) {
    if (doc.pageNumbers.pageRange?.trim()) {
      try {
        numberedSet = new Set(parsePageRange(doc.pageNumbers.pageRange, pages.length))
      } catch {
        numberedSet = null
      }
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const wp = pages[i]
    const hasRedactions = wp.annotations.some((a) => a.type === 'redact')
    let pdfPage: PDFPage

    if (!wp.sourceId) {
      pdfPage = out.addPage([wp.width, wp.height])
      const bg = hexToRgb(wp.bgColor)
      if (bg) pdfPage.drawRectangle({ x: 0, y: 0, width: wp.width, height: wp.height, color: bg })
    } else if (hasRedactions && typeof document !== 'undefined') {
      // Permanent redaction: rasterize page + burn out redaction boxes so text is unrecoverable
      let blob = sourceBlobs.get(wp.sourceId)
      if (!blob) {
        blob = await getLibraryBlob(wp.sourceId)
        if (!blob) throw new Error('Source PDF not found in local storage.')
        sourceBlobs.set(wp.sourceId, blob)
      }
      const jpgBytes = await renderRedactedPageAsImage(
        blob,
        wp.sourcePageIndex,
        wp,
        doc.passwords?.[wp.sourceId],
      )
      const jpg = await out.embedJpg(jpgBytes)
      const swapped = wp.rotation === 90 || wp.rotation === 270
      const w = swapped ? wp.height : wp.width
      const h = swapped ? wp.width : wp.height
      pdfPage = out.addPage([w, h])
      pdfPage.drawImage(jpg, { x: 0, y: 0, width: w, height: h })
    } else {
      let srcDoc = sourceDocs.get(wp.sourceId)
      if (!srcDoc) {
        const blob = await getLibraryBlob(wp.sourceId)
        if (!blob) throw new Error('Source PDF not found in local storage.')
        sourceBlobs.set(wp.sourceId, blob)
        srcDoc = await loadPdfDoc(blob, { password: doc.passwords?.[wp.sourceId] })
        sourceDocs.set(wp.sourceId, srcDoc)
      }
      const [copied] = await out.copyPages(srcDoc, [wp.sourcePageIndex])
      if (wp.rotation) {
        copied.setRotation(degrees((copied.getRotation().angle + wp.rotation) % 360))
      }
      pdfPage = out.addPage(copied)
    }

    // Apply crop box if set
    if (wp.crop) {
      const { width: pw, height: ph } = pdfPage.getSize()
      const cx = wp.crop.x * pw
      const cw = wp.crop.w * pw
      const ch = wp.crop.h * ph
      const cy = ph - (wp.crop.y + wp.crop.h) * ph
      pdfPage.setCropBox(cx, cy, cw, ch)
    }

    // Draw annotations (skip redact if already burned in)
    for (const ann of wp.annotations) {
      if (ann.type === 'redact' && wp.sourceId && typeof document !== 'undefined') continue
      await drawAnnotation(out, pdfPage, ann, fontCache)
    }

    const { width: pw, height: ph } = pdfPage.getSize()

    // Watermark
    if (doc.watermark.enabled && doc.watermark.kind === 'text' && doc.watermark.text.trim()) {
      let wmFont = fontCache.get(StandardFonts.HelveticaBold)
      if (!wmFont) {
        wmFont = await out.embedFont(StandardFonts.HelveticaBold)
        fontCache.set(StandardFonts.HelveticaBold, wmFont)
      }
      const wmText = safeWinAnsi(doc.watermark.text)
      const wmColor = hexToRgb(doc.watermark.color) ?? rgb(0.4, 0.45, 0.52)
      const tw = wmFont.widthOfTextAtSize(wmText, doc.watermark.fontSize)
      if (doc.watermark.repeat) {
        const stepX = Math.max(160, tw + 80)
        const stepY = Math.max(120, doc.watermark.fontSize * 3)
        for (let gx = -pw * 0.2; gx < pw * 1.1; gx += stepX) {
          for (let gy = 0; gy < ph * 1.1; gy += stepY) {
            pdfPage.drawText(wmText, {
              x: gx,
              y: gy,
              size: doc.watermark.fontSize,
              font: wmFont,
              color: wmColor,
              opacity: doc.watermark.opacity,
              rotate: degrees(doc.watermark.rotation),
            })
          }
        }
      } else {
        let wx = (pw - tw) / 2
        let wy = ph / 2
        if (doc.watermark.position === 'top-left') { wx = 40; wy = ph - 80 }
        else if (doc.watermark.position === 'top-right') { wx = pw - tw - 40; wy = ph - 80 }
        else if (doc.watermark.position === 'bottom-left') { wx = 40; wy = 60 }
        else if (doc.watermark.position === 'bottom-right') { wx = pw - tw - 40; wy = 60 }
        pdfPage.drawText(wmText, {
          x: wx,
          y: wy,
          size: doc.watermark.fontSize,
          font: wmFont,
          color: wmColor,
          opacity: doc.watermark.opacity,
          rotate: degrees(doc.watermark.rotation),
        })
      }
    }

    // Headers & Footers
    if (doc.headerFooter.enabled) {
      let hfFont = fontCache.get(StandardFonts.Helvetica)
      if (!hfFont) {
        hfFont = await out.embedFont(StandardFonts.Helvetica)
        fontCache.set(StandardFonts.Helvetica, hfFont)
      }
      const hfColor = hexToRgb(doc.headerFooter.color) ?? rgb(0.4, 0.4, 0.45)
      const sz = doc.headerFooter.fontSize
      const drawSlot = (raw: string, xAlign: 'left' | 'center' | 'right', y: number) => {
        if (!raw.trim()) return
        const txt = safeWinAnsi(
          raw.replace(/\{page\}/gi, String(i + 1)).replace(/\{total\}/gi, String(pages.length)),
        )
        const tw = hfFont!.widthOfTextAtSize(txt, sz)
        const tx = xAlign === 'left' ? 36 : xAlign === 'right' ? pw - tw - 36 : (pw - tw) / 2
        pdfPage.drawText(txt, { x: tx, y, size: sz, font: hfFont!, color: hfColor })
      }
      drawSlot(doc.headerFooter.headerLeft, 'left', ph - 26)
      drawSlot(doc.headerFooter.headerCenter, 'center', ph - 26)
      drawSlot(doc.headerFooter.headerRight, 'right', ph - 26)
      drawSlot(doc.headerFooter.footerLeft, 'left', 20)
      drawSlot(doc.headerFooter.footerCenter, 'center', 20)
      drawSlot(doc.headerFooter.footerRight, 'right', 20)
    }

    // Page numbers
    if (doc.pageNumbers.enabled && (!numberedSet || numberedSet.has(i))) {
      let numFont = fontCache.get(StandardFonts.Helvetica)
      if (!numFont) {
        numFont = await out.embedFont(StandardFonts.Helvetica)
        fontCache.set(StandardFonts.Helvetica, numFont)
      }
      const num = doc.pageNumbers.startNumber + i
      const total = doc.pageNumbers.startNumber + pages.length - 1
      const core =
        doc.pageNumbers.format === 'n-of-total'
          ? `${num} / ${total}`
          : doc.pageNumbers.format === 'page-n'
            ? `Page ${num}`
            : String(num)
      const label = safeWinAnsi(`${doc.pageNumbers.prefix}${core}${doc.pageNumbers.suffix}`)
      const sz = doc.pageNumbers.fontSize
      const tw = numFont.widthOfTextAtSize(label, sz)
      const pos = doc.pageNumbers.position
      const tx = pos.endsWith('left') ? 36 : pos.endsWith('right') ? pw - tw - 36 : (pw - tw) / 2
      const ty = pos.startsWith('top') ? ph - 26 : 18
      pdfPage.drawText(label, {
        x: tx,
        y: ty,
        size: sz,
        font: numFont,
        color: hexToRgb(doc.pageNumbers.color) ?? rgb(0.3, 0.3, 0.35),
      })
    }

    opts.onProgress?.((i + 1) / pages.length)
  }

  out.setProducer('PaperFlow AI')
  out.setCreator('PaperFlow AI')
  return savePdf(out)
}

export type PdfReadingColorMode = 'normal' | 'dark' | 'invert-print' | 'sepia' | 'ink-saver'

export const PDF_READING_MODES: Record<
  PdfReadingColorMode,
  { label: string; shortLabel: string; description: string; cssFilter: string }
> = {
  normal: {
    label: 'Original',
    shortLabel: 'Normal',
    description: 'Original document colors.',
    cssFilter: '',
  },
  dark: {
    label: 'Night Read',
    shortLabel: 'Dark',
    description: 'Eye-friendly dark charcoal paper with preserved image hues.',
    cssFilter: 'invert(0.92) hue-rotate(180deg) contrast(0.96)',
  },
  'invert-print': {
    label: 'Invert (Print Slides)',
    shortLabel: 'Invert',
    description: 'Turns black-background slides into crisp white print-friendly pages.',
    cssFilter: 'invert(1) hue-rotate(180deg) contrast(1.06)',
  },
  sepia: {
    label: 'Warm Sepia',
    shortLabel: 'Sepia',
    description: 'Soft warm book-paper tint for long reading sessions.',
    cssFilter: 'sepia(0.32) brightness(0.96) contrast(0.98)',
  },
  'ink-saver': {
    label: 'Ink-Saver B&W',
    shortLabel: 'B&W',
    description: 'High-contrast grayscale to save color ink when printing.',
    cssFilter: 'grayscale(1) contrast(1.22) brightness(1.04)',
  },
}

/**
 * Export the workspace PDF with the selected visual color filter permanently baked in
 * (ideal for converting dark-background lecture slides into print-friendly white pages).
 */
export async function exportFilteredWorkspacePdf(
  doc: WorkspaceDoc,
  mode: Exclude<PdfReadingColorMode, 'normal'>,
  opts: { pageIds?: string[]; onProgress?: (progress: number) => void } = {},
): Promise<Uint8Array> {
  const baseBytes = await exportWorkspacePdf(doc, { pageIds: opts.pageIds })
  const filterCss = PDF_READING_MODES[mode].cssFilter
  const pdf = await openPdf(baseBytes)
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const baseVp = page.getViewport({ scale: 1 })
      const scale = 2 // 144 DPI crisp print quality
      const vp = page.getViewport({ scale })

      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = Math.max(1, Math.floor(vp.width))
      srcCanvas.height = Math.max(1, Math.floor(vp.height))
      const sctx = srcCanvas.getContext('2d', { alpha: false })!
      sctx.fillStyle = '#ffffff'
      sctx.fillRect(0, 0, srcCanvas.width, srcCanvas.height)
      await page.render({ canvas: srcCanvas, canvasContext: sctx, viewport: vp }).promise

      const dstCanvas = document.createElement('canvas')
      dstCanvas.width = srcCanvas.width
      dstCanvas.height = srcCanvas.height
      const dctx = dstCanvas.getContext('2d', { alpha: false })!
      dctx.fillStyle = '#ffffff'
      dctx.fillRect(0, 0, dstCanvas.width, dstCanvas.height)
      dctx.filter = filterCss
      dctx.drawImage(srcCanvas, 0, 0)
      dctx.filter = 'none'

      const blob = await new Promise<Blob>((resolve, reject) =>
        dstCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode filtered page'))), 'image/jpeg', 0.92),
      )
      srcCanvas.width = srcCanvas.height = 0
      dstCanvas.width = dstCanvas.height = 0

      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      const outPage = out.addPage([baseVp.width, baseVp.height])
      outPage.drawImage(jpg, { x: 0, y: 0, width: baseVp.width, height: baseVp.height })
      opts.onProgress?.(i / pdf.numPages)
    }
    out.setProducer('PaperFlow AI')
    out.setCreator('PaperFlow AI')
    return savePdf(out, { objectStreams: true })
  } finally {
    await closePdf(pdf)
  }
}
