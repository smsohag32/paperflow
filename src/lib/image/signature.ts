import { getDB, safeWrite, type StoredSignature } from '@/lib/storage/db'
import { uid } from '@/lib/utils/id'

export interface RemoveBgOptions {
  /** Luminance threshold above which pixels become transparent (120..250, default 210) */
  threshold: number
  /** Feather range below threshold for smooth antialiased edges (0..60, default 32) */
  feather: number
  /** Optional hex ink color override (e.g. '#0f172a', '#1d4ed8') */
  recolor?: string
  /** Trim transparent margins automatically */
  autoCrop?: boolean
}

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length !== 6) return [15, 23, 42]
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}

/**
 * Pure pixel-level background removal with antialiasing-aware alpha ramp.
 * Works on any RGBA ImageData (used both in live preview and unit tests).
 */
export function removeBackgroundFromImageData(data: ImageData, opts: RemoveBgOptions): ImageData {
  const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height)
  const d = out.data
  const threshold = Math.min(254, Math.max(80, opts.threshold))
  const feather = Math.max(1, opts.feather)
  const low = Math.max(0, threshold - feather)
  const tint = opts.recolor ? parseHex(opts.recolor) : null

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    // Perceptual luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    // Also check saturation so colored ink (blue/red) is preserved even if moderately bright
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0
    const effectiveLum = lum - sat * 45

    if (effectiveLum >= threshold) {
      d[i + 3] = 0
    } else if (effectiveLum > low) {
      const factor = (threshold - effectiveLum) / (threshold - low)
      d[i + 3] = Math.round(a * factor)
      if (tint) {
        d[i] = tint[0]
        d[i + 1] = tint[1]
        d[i + 2] = tint[2]
      }
    } else if (tint) {
      d[i] = tint[0]
      d[i + 1] = tint[1]
      d[i + 2] = tint[2]
    }
  }
  return out
}

/** Compute tight bounding box of non-transparent pixels. */
export function findContentBounds(data: ImageData, pad = 6) {
  const { width, height, data: d } = data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 10) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return { x: 0, y: 0, w: width, h: height }
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const w = Math.min(width - x, maxX - minX + 1 + pad * 2)
  const h = Math.min(height - y, maxY - minY + 1 + pad * 2)
  return { x, y, w, h }
}

/** Process an uploaded signature image/canvas into a clean transparent PNG Blob. */
export async function processSignatureCanvas(
  source: HTMLCanvasElement | ImageBitmap,
  opts: RemoveBgOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const cleaned = removeBackgroundFromImageData(imgData, opts)
  ctx.putImageData(cleaned, 0, 0)

  let finalCanvas = canvas
  if (opts.autoCrop !== false) {
    const b = findContentBounds(cleaned, 8)
    if (b.w > 2 && b.h > 2 && (b.w < canvas.width || b.h < canvas.height)) {
      const cropped = document.createElement('canvas')
      cropped.width = b.w
      cropped.height = b.h
      cropped.getContext('2d')!.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
      canvas.width = 0
      canvas.height = 0
      finalCanvas = cropped
    }
  }

  const width = finalCanvas.width
  const height = finalCanvas.height
  const blob = await new Promise<Blob>((resolve, reject) =>
    finalCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
  )
  finalCanvas.width = 0
  finalCanvas.height = 0
  return { blob, width, height }
}

/* ─────────────────── Local signature presets (IndexedDB) ─────────────────── */

export async function saveSignaturePreset(sig: Omit<StoredSignature, 'id' | 'createdAt'>) {
  const db = await getDB()
  const item: StoredSignature = { ...sig, id: uid('sig'), createdAt: Date.now() }
  await safeWrite(() => db.put('signatures', item))
  return item
}

export async function listSignaturePresets(): Promise<StoredSignature[]> {
  const db = await getDB()
  const all = await db.getAll('signatures')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSignaturePreset(id: string) {
  const db = await getDB()
  await db.delete('signatures', id)
}
