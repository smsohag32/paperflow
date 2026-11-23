import { rgb, StandardFonts } from '@cantoo/pdf-lib'
import { loadPdfDoc, loadPdfLib, savePdf } from '@/lib/pdf/pdflib'
import { closePdf, openPdf } from '@/lib/pdf/pdfjs'
import { throwIfAborted } from '@/lib/performance/task-queue'

export interface OcrLanguage {
  code: string
  name: string
  nativeName: string
  approxSizeMB: number
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', name: 'English', nativeName: 'English', approxSizeMB: 4.1 },
  { code: 'ben', name: 'Bangla', nativeName: 'বাংলা', approxSizeMB: 1.5 },
  { code: 'hin', name: 'Hindi', nativeName: 'हिन्दी', approxSizeMB: 1.6 },
  { code: 'ara', name: 'Arabic', nativeName: 'العربية', approxSizeMB: 1.4 },
  { code: 'spa', name: 'Spanish', nativeName: 'Español', approxSizeMB: 2.3 },
  { code: 'fra', name: 'French', nativeName: 'Français', approxSizeMB: 1.9 },
  { code: 'deu', name: 'German', nativeName: 'Deutsch', approxSizeMB: 2.4 },
  { code: 'por', name: 'Portuguese', nativeName: 'Português', approxSizeMB: 1.9 },
  { code: 'jpn', name: 'Japanese', nativeName: '日本語', approxSizeMB: 2.5 },
  { code: 'chi_sim', name: 'Chinese (Simplified)', nativeName: '简体中文', approxSizeMB: 2.4 },
]

export interface OcrWord {
  text: string
  confidence: number
  /** Normalized 0..1 coordinates (top-left origin) */
  x: number
  y: number
  w: number
  h: number
}

export interface OcrPageResult {
  pageIndex: number
  text: string
  confidence: number
  words: OcrWord[]
  lowConfidenceCount: number
}

export interface OcrProgress {
  pageIndex: number
  totalPages: number
  stage: string
  progress: number
}

/**
 * Run local Tesseract.js OCR on selected PDF pages or an image file.
 * Uses local `/vendor/tesseract` worker & WASM core copied at build/install time.
 * Language data (.traineddata.gz) is fetched on demand and cached in IndexedDB by Tesseract.js.
 */
export async function runOcrOnPdf(
  file: Blob,
  opts: {
    languages: string[]
    pages?: number[]
    dpi?: number
    password?: string
    signal?: AbortSignal
    onProgress?: (p: OcrProgress) => void
  },
): Promise<OcrPageResult[]> {
  const langs = opts.languages.length ? opts.languages : ['eng']
  const { createWorker } = await import('tesseract.js')

  let currentPage = 0
  let totalPages = 1

  const worker = await createWorker(langs, 1, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract-core',
    cacheMethod: 'write',
    logger: (m) => {
      if (m.status) {
        opts.onProgress?.({
          pageIndex: currentPage,
          totalPages,
          stage: m.status,
          progress: m.progress ?? 0,
        })
      }
    },
  })

  const isPdf = file.type === 'application/pdf' || (file instanceof File && file.name.toLowerCase().endsWith('.pdf'))
  const results: OcrPageResult[] = []

  try {
    if (!isPdf) {
      throwIfAborted(opts.signal)
      const bmp = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width
      canvas.height = bmp.height
      canvas.getContext('2d')!.drawImage(bmp, 0, 0)
      bmp.close()
      const res = await worker.recognize(canvas, {}, { text: true, blocks: true })
      const pageRes = extractPageResult(0, res.data, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
      results.push(pageRes)
      return results
    }

    const pdf = await openPdf(file, { password: opts.password })
    const indices = opts.pages?.length ? opts.pages : Array.from({ length: pdf.numPages }, (_, i) => i)
    totalPages = indices.length
    const scale = (opts.dpi ?? 180) / 72

    try {
      for (let i = 0; i < indices.length; i++) {
        throwIfAborted(opts.signal)
        currentPage = i
        const pIdx = indices[i]
        const page = await pdf.getPage(pIdx + 1)
        const vp = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(vp.width))
        canvas.height = Math.max(1, Math.floor(vp.height))
        const ctx = canvas.getContext('2d', { alpha: false })!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise

        throwIfAborted(opts.signal)
        const res = await worker.recognize(canvas, {}, { text: true, blocks: true })
        results.push(extractPageResult(pIdx, res.data, canvas.width, canvas.height))
        canvas.width = 0
        canvas.height = 0
      }
    } finally {
      await closePdf(pdf)
    }
    return results
  } finally {
    await worker.terminate().catch(() => {})
  }
}

function extractPageResult(
  pageIndex: number,
  data: { text: string; confidence: number; blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[] | null },
  imgW: number,
  imgH: number,
): OcrPageResult {
  const words: OcrWord[] = []
  for (const b of data.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        for (const w of l.words ?? []) {
          if (!w.text.trim()) continue
          words.push({
            text: w.text,
            confidence: w.confidence,
            x: w.bbox.x0 / imgW,
            y: w.bbox.y0 / imgH,
            w: (w.bbox.x1 - w.bbox.x0) / imgW,
            h: (w.bbox.y1 - w.bbox.y0) / imgH,
          })
        }
      }
    }
  }
  const lowConfidenceCount = words.filter((w) => w.confidence < 65).length
  return {
    pageIndex,
    text: data.text.trim(),
    confidence: Math.round(data.confidence),
    words,
    lowConfidenceCount,
  }
}

/**
 * Create a searchable PDF by overlaying an invisible (opacity 0) positioned text layer
 * directly onto the original PDF pages, preserving the exact visual appearance of the scan.
 */
export async function buildSearchablePdf(
  sourceFile: Blob,
  ocrResults: OcrPageResult[],
  password?: string,
): Promise<Uint8Array> {
  const isPdf =
    sourceFile.type === 'application/pdf' ||
    (sourceFile instanceof File && sourceFile.name.toLowerCase().endsWith('.pdf'))

  let doc
  if (isPdf) {
    doc = await loadPdfDoc(sourceFile, { password })
  } else {
    const { PDFDocument } = await loadPdfLib()
    doc = await PDFDocument.create()
    const raw = new Uint8Array(await sourceFile.arrayBuffer())
    const isPng = raw[0] === 0x89 && raw[1] === 0x50
    const img = isPng ? await doc.embedPng(raw) : await doc.embedJpg(raw)
    const p = doc.addPage([img.width, img.height])
    p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()

  for (const res of ocrResults) {
    const page = pages[res.pageIndex]
    if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    for (const w of res.words) {
      // Standard WinAnsi safe fallback for invisible PDF text layer
      const safe = w.text.replace(/[^\x20-\x7e\xa0-\xff]/g, '').trim()
      if (!safe) continue
      const fontSize = Math.max(5, Math.min(36, w.h * ph * 0.85))
      const x = w.x * pw
      const y = ph - (w.y + w.h) * ph
      page.drawText(safe, {
        x,
        y: Math.max(2, y),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.001, // Visually invisible, fully selectable & searchable in PDF readers
      })
    }
  }

  doc.setProducer('PaperFlow AI (OCR Searchable PDF)')
  return savePdf(doc)
}
