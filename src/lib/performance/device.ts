import type { PerformanceMode } from '@/types/common'

export interface DeviceCapabilities {
  cores: number
  /** GB, from navigator.deviceMemory (Chromium only). null when unknown. */
  memoryGB: number | null
  webgpu: boolean
  webgl: boolean
  wasm: boolean
  wasmSimd: boolean
  offscreenCanvas: boolean
  workers: boolean
  touch: boolean
  screenWidth: number
  dpr: number
  reducedMotion: boolean
  saveData: boolean
  mobile: boolean
}

let cached: DeviceCapabilities | null = null

export function detectCapabilities(): DeviceCapabilities {
  if (cached) return cached
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
    gpu?: unknown
    userAgentData?: { mobile?: boolean }
  }
  let webgl = false
  try {
    const c = document.createElement('canvas')
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webgl = false
  }
  let wasmSimd = false
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function'
  if (wasm) {
    try {
      // Minimal module using a v128 instruction — validates only with SIMD support.
      wasmSimd = WebAssembly.validate(
        new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
      )
    } catch {
      wasmSimd = false
    }
  }
  const mobile =
    nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '')
  cached = {
    cores: navigator.hardwareConcurrency || 2,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    webgpu: 'gpu' in nav && !!nav.gpu,
    webgl,
    wasm,
    wasmSimd,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    workers: typeof Worker !== 'undefined',
    touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    screenWidth: window.innerWidth,
    dpr: window.devicePixelRatio || 1,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: !!nav.connection?.saveData,
    mobile,
  }
  return cached
}

/** Verify WebGPU really works (an adapter can be obtained). Async and lazy. */
export async function probeWebGPU(): Promise<{ ok: boolean; fp16: boolean; adapterInfo?: string }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) return { ok: false, fp16: false }
  try {
    const adapter = (await gpu.requestAdapter()) as {
      features: Set<string>
      info?: { vendor?: string; architecture?: string; description?: string }
    } | null
    if (!adapter) return { ok: false, fp16: false }
    const info = adapter.info
    return {
      ok: true,
      fp16: adapter.features.has('shader-f16'),
      adapterInfo: info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') : undefined,
    }
  } catch {
    return { ok: false, fp16: false }
  }
}

export type ResolvedProfile = 'high' | 'balanced' | 'low'

export interface PerformanceProfile {
  name: ResolvedProfile
  /** Maximum device-pixel-ratio used when rendering pages. */
  maxDpr: number
  /** Thumbnail target width in CSS px (rendered at x DPR capped). */
  thumbWidth: number
  /** Max concurrent PDF.js render tasks. */
  renderConcurrency: number
  /** Thumbnail LRU entries. */
  thumbCacheSize: number
  /** Pages rendered above/below the viewport. */
  prefetchPages: number
  /** Background worker concurrency for batch work. */
  workerConcurrency: number
  /** Hard cap for canvas pixels per page render. */
  maxCanvasPixels: number
  animations: boolean
}

export function autoProfile(caps: DeviceCapabilities): ResolvedProfile {
  const mem = caps.memoryGB
  if ((mem !== null && mem <= 4) || caps.cores <= 2 || caps.saveData) return 'low'
  if ((mem === null || mem >= 8) && caps.cores >= 8 && !caps.mobile) return 'high'
  return 'balanced'
}

export function resolveProfile(
  mode: PerformanceMode,
  caps: DeviceCapabilities,
  overrides: { cacheLimit?: number; workerConcurrency?: number; reduceMotion?: boolean; batterySaver?: boolean } = {},
): PerformanceProfile {
  let name: ResolvedProfile = mode === 'auto' ? autoProfile(caps) : mode
  if (overrides.batterySaver && name === 'high') name = 'balanced'
  const base: Record<ResolvedProfile, PerformanceProfile> = {
    high: {
      name: 'high',
      maxDpr: 2,
      thumbWidth: 150,
      renderConcurrency: Math.min(4, Math.max(2, caps.cores >> 1)),
      thumbCacheSize: 240,
      prefetchPages: 2,
      workerConcurrency: Math.min(4, Math.max(2, caps.cores - 2)),
      maxCanvasPixels: 16_000_000,
      animations: true,
    },
    balanced: {
      name: 'balanced',
      maxDpr: 1.5,
      thumbWidth: 130,
      renderConcurrency: 2,
      thumbCacheSize: 120,
      prefetchPages: 1,
      workerConcurrency: 2,
      maxCanvasPixels: 8_000_000,
      animations: true,
    },
    low: {
      name: 'low',
      maxDpr: 1,
      thumbWidth: 110,
      renderConcurrency: 1,
      thumbCacheSize: 48,
      prefetchPages: 0,
      workerConcurrency: 1,
      maxCanvasPixels: 4_000_000,
      animations: false,
    },
  }
  const p = { ...base[name] }
  if (overrides.cacheLimit && overrides.cacheLimit > 0) p.thumbCacheSize = overrides.cacheLimit
  if (overrides.workerConcurrency && overrides.workerConcurrency > 0) p.workerConcurrency = overrides.workerConcurrency
  if (overrides.reduceMotion || caps.reducedMotion || overrides.batterySaver) p.animations = false
  if (overrides.batterySaver) {
    p.renderConcurrency = 1
    p.prefetchPages = 0
    p.workerConcurrency = 1
  }
  return p
}
