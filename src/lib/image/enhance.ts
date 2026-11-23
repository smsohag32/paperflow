export type ScanPresetKey =
  | 'document'
  | 'receipt'
  | 'certificate'
  | 'id-card'
  | 'handwritten'
  | 'newspaper'
  | 'book'
  | 'photo'

export interface EnhanceSettings {
  preset: ScanPresetKey | 'custom'
  brightness: number // -50 .. +50
  contrast: number // -50 .. +80
  sharpen: number // 0 .. 100
  denoise: number // 0 .. 100
  backgroundCleanup: number // 0 .. 100 (whitening / shadow lifting)
  grayscale: boolean
  blackAndWhite: boolean
  bwThreshold: number // 60 .. 220
  rotation: number // degrees (-15 .. +15 fine deskew + 90 deg steps)
}

export const SCAN_PRESETS: Record<ScanPresetKey, { label: string; settings: Omit<EnhanceSettings, 'preset' | 'rotation'> }> = {
  document: {
    label: 'Document',
    settings: { brightness: 8, contrast: 28, sharpen: 35, denoise: 15, backgroundCleanup: 55, grayscale: false, blackAndWhite: false, bwThreshold: 165 },
  },
  receipt: {
    label: 'Receipt',
    settings: { brightness: 12, contrast: 45, sharpen: 40, denoise: 25, backgroundCleanup: 70, grayscale: true, blackAndWhite: true, bwThreshold: 170 },
  },
  certificate: {
    label: 'Certificate',
    settings: { brightness: 4, contrast: 16, sharpen: 30, denoise: 10, backgroundCleanup: 25, grayscale: false, blackAndWhite: false, bwThreshold: 165 },
  },
  'id-card': {
    label: 'ID Card',
    settings: { brightness: 6, contrast: 22, sharpen: 45, denoise: 15, backgroundCleanup: 20, grayscale: false, blackAndWhite: false, bwThreshold: 165 },
  },
  handwritten: {
    label: 'Handwritten Notes',
    settings: { brightness: 10, contrast: 36, sharpen: 25, denoise: 20, backgroundCleanup: 65, grayscale: false, blackAndWhite: false, bwThreshold: 160 },
  },
  newspaper: {
    label: 'Newspaper',
    settings: { brightness: 14, contrast: 40, sharpen: 30, denoise: 35, backgroundCleanup: 60, grayscale: true, blackAndWhite: false, bwThreshold: 160 },
  },
  book: {
    label: 'Book Page',
    settings: { brightness: 10, contrast: 32, sharpen: 30, denoise: 20, backgroundCleanup: 75, grayscale: true, blackAndWhite: false, bwThreshold: 168 },
  },
  photo: {
    label: 'Photo',
    settings: { brightness: 4, contrast: 12, sharpen: 20, denoise: 10, backgroundCleanup: 0, grayscale: false, blackAndWhite: false, bwThreshold: 165 },
  },
}

/**
 * Pure ImageData scan enhancement pipeline:
 * 1. Optional 3x3 box denoise
 * 2. Background cleanup / shadow lifting (local white-point lift)
 * 3. Brightness & Contrast
 * 4. Optional unsharp-mask sharpening
 * 5. Optional Grayscale or Black & White thresholding
 */
export function enhanceImageData(src: ImageData, settings: EnhanceSettings): ImageData {
  const { width, height } = src
  let cur = new Uint8ClampedArray(src.data)

  // 1. Light denoise (3x3 average blend)
  if (settings.denoise > 0) {
    const strength = (settings.denoise / 100) * 0.6
    const next = new Uint8ClampedArray(cur)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4
        for (let c = 0; c < 3; c++) {
          const avg =
            (cur[idx - width * 4 - 4 + c] +
              cur[idx - width * 4 + c] +
              cur[idx - width * 4 + 4 + c] +
              cur[idx - 4 + c] +
              cur[idx + c] +
              cur[idx + 4 + c] +
              cur[idx + width * 4 - 4 + c] +
              cur[idx + width * 4 + c] +
              cur[idx + width * 4 + 4 + c]) /
            9
          next[idx + c] = Math.round(cur[idx + c] * (1 - strength) + avg * strength)
        }
      }
    }
    cur = next
  }

  // 2. Background cleanup (shadow reduction + paper whitening) + brightness/contrast
  const brightOffset = settings.brightness * 2.2
  const contrastFactor = Math.pow((100 + settings.contrast) / 100, 1.35)
  const bgStrength = settings.backgroundCleanup / 100
  const whiteCutoff = 255 - bgStrength * 65

  for (let i = 0; i < cur.length; i += 4) {
    let r = cur[i]
    let g = cur[i + 1]
    let b = cur[i + 2]

    // Background whitening for light paper / soft shadows
    if (bgStrength > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum > whiteCutoff) {
        const lift = Math.min(1, (lum - whiteCutoff) / Math.max(1, 255 - whiteCutoff))
        const k = lift * bgStrength
        r = r + (255 - r) * k
        g = g + (255 - g) * k
        b = b + (255 - b) * k
      }
    }

    r = (r - 128) * contrastFactor + 128 + brightOffset
    g = (g - 128) * contrastFactor + 128 + brightOffset
    b = (b - 128) * contrastFactor + 128 + brightOffset

    if (settings.grayscale || settings.blackAndWhite) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const v = settings.blackAndWhite ? (lum >= settings.bwThreshold ? 255 : 0) : lum
      r = g = b = v
    }

    cur[i] = r < 0 ? 0 : r > 255 ? 255 : r
    cur[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    cur[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }

  // 3. Sharpen (3x3 Laplacian kernel blend)
  if (settings.sharpen > 0 && !settings.blackAndWhite) {
    const amt = (settings.sharpen / 100) * 0.9
    const next = new Uint8ClampedArray(cur)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4
        for (let c = 0; c < 3; c++) {
          const center = cur[idx + c]
          const neighbors =
            (cur[idx - width * 4 + c] + cur[idx + width * 4 + c] + cur[idx - 4 + c] + cur[idx + 4 + c]) / 4
          const v = center + (center - neighbors) * amt * 2.2
          next[idx + c] = v < 0 ? 0 : v > 255 ? 255 : v
        }
      }
    }
    cur = next
  }

  return new ImageData(cur, width, height)
}

/**
 * Estimate skew angle in degrees (-6°..+6°) using horizontal projection profile variance.
 * Runs quickly on a downscaled grayscale buffer.
 */
export function estimateSkewAngle(src: ImageData): number {
  const { width, height, data } = src
  const stepX = Math.max(1, Math.floor(width / 200))
  const stepY = Math.max(1, Math.floor(height / 200))
  let bestAngle = 0
  let bestScore = -1

  for (let angle = -6; angle <= 6; angle += 0.5) {
    const rad = (angle * Math.PI) / 180
    const sin = Math.sin(rad)
    const bins = new Float32Array(Math.ceil(height / stepY) + 40)
    const offset = 20

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (y * width + x) * 4
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        if (lum < 150) {
          const ry = Math.round((y + (x - width / 2) * sin) / stepY) + offset
          if (ry >= 0 && ry < bins.length) bins[ry] += 1
        }
      }
    }
    let score = 0
    for (let i = 0; i < bins.length; i++) score += bins[i] * bins[i]
    if (score > bestScore) {
      bestScore = score
      bestAngle = angle
    }
  }
  return -bestAngle
}

/** Render enhanced canvas with optional fine rotation / deskew. */
export function applyEnhanceToCanvas(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  settings: EnhanceSettings,
) {
  const w = source.width
  const h = source.height
  target.width = w
  target.height = h
  const ctx = target.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  if (settings.rotation) {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((settings.rotation * Math.PI) / 180)
    ctx.drawImage(source, -w / 2, -h / 2)
    ctx.restore()
  } else {
    ctx.drawImage(source, 0, 0)
  }

  const imgData = ctx.getImageData(0, 0, w, h)
  const enhanced = enhanceImageData(imgData, settings)
  ctx.putImageData(enhanced, 0, 0)
}
