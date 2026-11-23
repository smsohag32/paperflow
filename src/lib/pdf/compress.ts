import { loadPdfDoc, loadPdfLib, savePdf } from './pdflib'
import { openPdf } from './pdfjs'
import { throwIfAborted } from '@/lib/performance/task-queue'

export type CompressionPreset = 'light' | 'balanced' | 'strong' | 'maximum' | 'custom'
export type ColorMode = 'color' | 'grayscale' | 'bw'

export interface CompressionOptions {
  preset: CompressionPreset
  /** JPEG quality 0.25 .. 0.95 */
  imageQuality: number
  /** Target DPI for rasterized pages when image compression is needed (72 .. 220) */
  dpi: number
  colorMode: ColorMode
  stripMetadata: boolean
  /** Optional target size in bytes (e.g. 500_000 for 500 KB) */
  targetBytes?: number
  password?: string
  signal?: AbortSignal
  onProgress?: (progress: number, status: string) => void
}

export interface CompressionAnalysis {
  pageCount: number
  originalBytes: number
  /** Heuristic: true if pages have very little selectable text (likely scanned/image-heavy) */
  likelyScanned: boolean
  avgCharsPerPage: number
  recommendedStrategy: 'lossless-structure' | 'adaptive-raster'
}

export interface CompressionResult {
  bytes: Uint8Array
  originalBytes: number
  compressedBytes: number
  savingsBytes: number
  savingsPercent: number
  strategyUsed: 'lossless-structure' | 'raster-reencode'
  targetBytes?: number
  targetReached: boolean
  qualityWarning?: string
  attempts: number
}

export const COMPRESSION_PRESETS: Record<
  Exclude<CompressionPreset, 'custom'>,
  { label: string; description: string; imageQuality: number; dpi: number; colorMode: ColorMode; stripMetadata: boolean }
> = {
  light: {
    label: 'Light',
    description: 'Clean structure & metadata, preserve crisp visuals (150 DPI, 85% quality).',
    imageQuality: 0.85,
    dpi: 150,
    colorMode: 'color',
    stripMetadata: true,
  },
  balanced: {
    label: 'Balanced',
    description: 'Good readability and strong size reduction (120 DPI, 72% quality).',
    imageQuality: 0.72,
    dpi: 120,
    colorMode: 'color',
    stripMetadata: true,
  },
  strong: {
    label: 'Strong',
    description: 'Noticeably smaller files for email & uploads (96 DPI, 58% quality).',
    imageQuality: 0.58,
    dpi: 96,
    colorMode: 'color',
    stripMetadata: true,
  },
  maximum: {
    label: 'Maximum',
    description: 'Smallest size using grayscale and aggressive compression (80 DPI, 45% quality).',
    imageQuality: 0.45,
    dpi: 80,
    colorMode: 'grayscale',
    stripMetadata: true,
  },
}

/**
 * Step 1: Analyze the PDF to understand whether it is text/vector-heavy or scan/image-heavy.
 */
export async function analyzeForCompression(
  file: Blob | Uint8Array,
  password?: string,
): Promise<CompressionAnalysis> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
  const pdf = await openPdf(bytes, { password })
  try {
    const sampleCount = Math.min(pdf.numPages, 5)
    let totalChars = 0
    for (let i = 1; i <= sampleCount; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item) totalChars += item.str.trim().length
      }
    }
    const avgCharsPerPage = sampleCount > 0 ? totalChars / sampleCount : 0
    const bytesPerPage = bytes.byteLength / Math.max(1, pdf.numPages)
    const likelyScanned = avgCharsPerPage < 40 || bytesPerPage > 220_000
    return {
      pageCount: pdf.numPages,
      originalBytes: bytes.byteLength,
      likelyScanned,
      avgCharsPerPage: Math.round(avgCharsPerPage),
      recommendedStrategy: likelyScanned ? 'adaptive-raster' : 'lossless-structure',
    }
  } finally {
    await pdf.destroy()
  }
}

/** Lossless structural optimization: object streams + optional metadata cleanup. Preserves 100% of vectors/text. */
async function losslessOptimize(
  inputBytes: Uint8Array,
  stripMetadata: boolean,
  password?: string,
): Promise<Uint8Array> {
  const doc = await loadPdfDoc(inputBytes, { password, updateMetadata: false })
  if (stripMetadata) {
    doc.setTitle('')
    doc.setAuthor('')
    doc.setSubject('')
    doc.setKeywords([])
    doc.setProducer('')
    doc.setCreator('')
  }
  return savePdf(doc, { objectStreams: true })
}

/** Rasterize and re-encode pages at chosen DPI/quality/color mode. */
async function rasterReencode(
  inputBytes: Uint8Array,
  opts: { dpi: number; quality: number; colorMode: ColorMode; password?: string; signal?: AbortSignal; onPage?: (i: number, n: number) => void },
): Promise<Uint8Array> {
  const pdf = await openPdf(inputBytes, { password: opts.password })
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  const scale = opts.dpi / 72

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      throwIfAborted(opts.signal)
      const page = await pdf.getPage(i)
      const baseVp = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(vp.width))
      canvas.height = Math.max(1, Math.floor(vp.height))
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: opts.colorMode !== 'color' })!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise

      if (opts.colorMode !== 'color') {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const d = imgData.data
        const bw = opts.colorMode === 'bw'
        for (let p = 0; p < d.length; p += 4) {
          const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
          const v = bw ? (lum > 175 ? 255 : 0) : lum
          d[p] = d[p + 1] = d[p + 2] = v
        }
        ctx.putImageData(imgData, 0, 0)
      }

      const jpgBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))),
          'image/jpeg',
          opts.quality,
        ),
      )
      canvas.width = 0
      canvas.height = 0
      const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer())
      const img = await out.embedJpg(jpgBytes)
      const outPage = out.addPage([baseVp.width, baseVp.height])
      outPage.drawImage(img, { x: 0, y: 0, width: baseVp.width, height: baseVp.height })
      opts.onPage?.(i, pdf.numPages)
    }
    return savePdf(out, { objectStreams: true })
  } finally {
    await pdf.destroy()
  }
}

/**
 * Adaptive PDF compression pipeline:
 * 1. Always tries lossless structural optimization first (preserves vector text).
 * 2. If lossless reaches target (or user chose Light on a vector PDF without target), stops immediately.
 * 3. Otherwise applies raster re-encoding and iteratively adapts DPI/quality toward targetBytes,
 *    stopping when target is reached, quality floor is hit, or further passes stop helping.
 * Never claims a target was reached if it wasn't.
 */
export async function compressPdf(
  file: Blob | Uint8Array,
  opts: CompressionOptions,
): Promise<CompressionResult> {
  const inputBytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
  const originalBytes = inputBytes.byteLength
  throwIfAborted(opts.signal)

  opts.onProgress?.(0.08, 'Analyzing document structure…')
  const lossless = await losslessOptimize(inputBytes, opts.stripMetadata, opts.password)
  let best = lossless.byteLength < originalBytes ? lossless : inputBytes
  let strategyUsed: 'lossless-structure' | 'raster-reencode' = 'lossless-structure'
  let attempts = 1

  // If no canvas (e.g. non-DOM environment) or target already met by lossless optimization
  const canRasterize = typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
  if (opts.targetBytes && best.byteLength <= opts.targetBytes) {
    opts.onProgress?.(1, 'Target size reached losslessly')
    return buildResult(best, originalBytes, strategyUsed, opts.targetBytes, attempts)
  }

  const wantsRaster =
    canRasterize &&
    (opts.colorMode !== 'color' ||
      opts.preset !== 'light' ||
      (opts.targetBytes !== undefined && best.byteLength > opts.targetBytes))

  if (!wantsRaster) {
    opts.onProgress?.(1, 'Done')
    return buildResult(best, originalBytes, strategyUsed, opts.targetBytes, attempts)
  }

  // Adaptive raster loop
  let dpi = opts.dpi
  let quality = opts.imageQuality
  let colorMode = opts.colorMode
  const maxAttempts = opts.targetBytes ? 4 : 1

  for (let pass = 0; pass < maxAttempts; pass++) {
    throwIfAborted(opts.signal)
    attempts++
    opts.onProgress?.(
      0.15 + (pass / maxAttempts) * 0.8,
      `Optimizing pages (pass ${pass + 1}/${maxAttempts}, ${Math.round(dpi)} DPI, ${Math.round(quality * 100)}% quality)…`,
    )
    const candidate = await rasterReencode(inputBytes, {
      dpi,
      quality,
      colorMode,
      password: opts.password,
      signal: opts.signal,
      onPage: (cur, total) => {
        const base = 0.15 + (pass / maxAttempts) * 0.8
        const span = (1 / maxAttempts) * 0.78
        opts.onProgress?.(base + (cur / total) * span, `Pass ${pass + 1}: page ${cur} of ${total}`)
      },
    })

    if (candidate.byteLength < best.byteLength) {
      best = candidate
      strategyUsed = 'raster-reencode'
    }

    if (!opts.targetBytes || best.byteLength <= opts.targetBytes) break

    // Adjust parameters proportionally for next attempt, respecting minimum readable floor
    const ratio = opts.targetBytes / candidate.byteLength
    const nextQuality = Math.max(0.3, quality * Math.min(0.82, Math.max(0.55, Math.sqrt(ratio))))
    const nextDpi = Math.max(68, dpi * Math.min(0.88, Math.max(0.65, Math.sqrt(ratio))))
    if (Math.abs(nextQuality - quality) < 0.03 && Math.abs(nextDpi - dpi) < 4) {
      if (colorMode === 'color') {
        colorMode = 'grayscale'
      } else {
        break
      }
    }
    quality = nextQuality
    dpi = nextDpi
  }

  opts.onProgress?.(1, 'Compression complete')
  return buildResult(best, originalBytes, strategyUsed, opts.targetBytes, attempts, quality < 0.48 || dpi < 85)
}

function buildResult(
  bytes: Uint8Array,
  originalBytes: number,
  strategyUsed: 'lossless-structure' | 'raster-reencode',
  targetBytes: number | undefined,
  attempts: number,
  lowQuality = false,
): CompressionResult {
  const compressedBytes = bytes.byteLength
  const savingsBytes = Math.max(0, originalBytes - compressedBytes)
  const savingsPercent = originalBytes > 0 ? (savingsBytes / originalBytes) * 100 : 0
  const targetReached = targetBytes ? compressedBytes <= targetBytes : true

  let qualityWarning: string | undefined
  if (targetBytes && !targetReached) {
    qualityWarning =
      'Target size could not be reached without making pages unreadable. Returned the smallest readable version.'
  } else if (strategyUsed === 'raster-reencode' && lowQuality) {
    qualityWarning = 'Strong compression was applied (pages rasterized at lower resolution). Inspect readability before sharing.'
  } else if (strategyUsed === 'raster-reencode') {
    qualityWarning = 'Pages were re-encoded as compressed images to reduce size; selectable text is not preserved in this copy.'
  }

  return {
    bytes,
    originalBytes,
    compressedBytes,
    savingsBytes,
    savingsPercent,
    strategyUsed,
    targetBytes,
    targetReached,
    qualityWarning,
    attempts,
  }
}
