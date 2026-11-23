import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { closePdf, loadPdfjs, openPdf } from './pdfjs'
import { TaskQueue, isAbortError } from '@/lib/performance/task-queue'
import { LRUCache } from '@/lib/performance/lru'
import { getProfile, onProfileChange } from '@/lib/performance/profile'

/**
 * Shared PDF.js document registry + render queue.
 * One PDFDocumentProxy per source (reused by thumbnails and the main viewer),
 * one global bounded queue for all rendering so large documents can't
 * flood the CPU or memory.
 */

type SourceLoader = () => Promise<{ data: Blob | ArrayBuffer; password?: string }>

const loaders = new Map<string, SourceLoader>()
const docs = new Map<string, Promise<PDFDocumentProxy>>()

export function registerSource(id: string, loader: SourceLoader) {
  loaders.set(id, loader)
}

export function getDocument(id: string): Promise<PDFDocumentProxy> {
  let p = docs.get(id)
  if (!p) {
    const loader = loaders.get(id)
    if (!loader) return Promise.reject(new Error(`Unknown source ${id}`))
    p = loader()
      .then(({ data, password }) => openPdf(data, { password }))
      .catch((e) => {
        docs.delete(id)
        throw e
      })
    docs.set(id, p)
  }
  return p
}

export async function releaseDocument(id: string) {
  const p = docs.get(id)
  docs.delete(id)
  loaders.delete(id)
  thumbCache.clearPrefix(id)
  if (p) {
    try {
      const d = await p
      await closePdf(d)
    } catch {
      /* ignore */
    }
  }
}

export async function releaseAllDocuments() {
  await Promise.all([...docs.keys()].map((id) => releaseDocument(id)))
}

/* ───────────────────────── Render queue ───────────────────────── */

export const renderQueue = new TaskQueue(getProfile().renderConcurrency)
onProfileChange((p) => {
  renderQueue.setConcurrency(p.renderConcurrency)
  thumbCache.resize(p.thumbCacheSize)
})

export interface RenderOptions {
  /** CSS pixel scale (1 = 72dpi → 1px per pt) */
  scale: number
  /** Device pixel ratio to use; capped by profile */
  dpr?: number
  rotation?: number
  priority?: number
  signal?: AbortSignal
  /** Render annotations/forms embedded in the PDF (default true) */
  annotations?: boolean
  background?: string
}

/**
 * Render a page into the given canvas. Respects profile limits on DPR and pixel count.
 * Returns the effective output scale.
 */
export async function renderPageToCanvas(
  sourceId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): Promise<number> {
  return renderQueue.add(
    async (signal) => {
      const doc = await getDocument(sourceId)
      const page = await doc.getPage(pageIndex + 1)
      return drawPage(page, canvas, opts, signal)
    },
    { priority: opts.priority ?? 5, signal: opts.signal },
  )
}

export async function drawPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: RenderOptions,
  signal?: AbortSignal,
): Promise<number> {
  const profile = getProfile()
  const dpr = Math.min(opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ?? 1, profile.maxDpr)
  const rotation = opts.rotation ?? 0
  let outScale = opts.scale * dpr
  let viewport = page.getViewport({ scale: outScale, rotation })
  const pixels = viewport.width * viewport.height
  if (pixels > profile.maxCanvasPixels) {
    outScale *= Math.sqrt(profile.maxCanvasPixels / pixels)
    viewport = page.getViewport({ scale: outScale, rotation })
  }
  const w = Math.max(1, Math.floor(viewport.width))
  const h = Math.max(1, Math.floor(viewport.height))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.fillStyle = opts.background ?? '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const task = page.render({
    canvas: canvas as HTMLCanvasElement,
    canvasContext: ctx,
    viewport,
    annotationMode: opts.annotations === false ? 0 : 1,
    background: opts.background ?? '#ffffff',
  })
  const onAbort = () => task.cancel()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await task.promise
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
  return outScale
}

/**
 * Render PDF.js native selectable text layer into `container` aligned to `scale` & `rotation`.
 */
export async function renderTextLayer(
  sourceId: string,
  pageIndex: number,
  container: HTMLDivElement,
  opts: { scale: number; rotation?: number; signal?: AbortSignal },
): Promise<void> {
  const [lib, doc] = await Promise.all([loadPdfjs(), getDocument(sourceId)])
  if (opts.signal?.aborted) return
  const page = await doc.getPage(pageIndex + 1)
  if (opts.signal?.aborted) return

  const viewport = page.getViewport({ scale: opts.scale, rotation: opts.rotation ?? 0 })
  container.replaceChildren()
  container.style.setProperty('--scale-factor', String(opts.scale))
  container.style.setProperty('--total-scale-factor', String(opts.scale))

  const textLayer = new lib.TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  })

  const onAbort = () => textLayer.cancel()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await textLayer.render()
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/* ───────────────────────── Thumbnail cache ───────────────────────── */

class ThumbCache {
  private lru = new LRUCache<string, ImageBitmap | HTMLCanvasElement>(getProfile().thumbCacheSize, (v) => {
    if ('close' in v) v.close()
    else {
      v.width = 0
      v.height = 0
    }
  })
  private inflight = new Map<string, Promise<ImageBitmap | HTMLCanvasElement>>()

  key(sourceId: string, pageIndex: number, width: number) {
    return `${sourceId}:${pageIndex}:${width}`
  }

  get(k: string) {
    return this.lru.get(k)
  }

  resize(n: number) {
    this.lru.resize(n)
  }

  clear() {
    this.lru.clear()
  }

  clearPrefix(prefix: string) {
    for (const k of [...this.lru.keys()]) if (k.startsWith(prefix + ':')) this.lru.delete(k)
  }

  get size() {
    return this.lru.size
  }

  async load(sourceId: string, pageIndex: number, width: number, priority: number, signal?: AbortSignal) {
    const k = this.key(sourceId, pageIndex, width)
    const hit = this.lru.get(k)
    if (hit) return hit
    let p = this.inflight.get(k)
    if (!p) {
      p = renderQueue
        .add(
          async (sig) => {
            const doc = await getDocument(sourceId)
            const page = await doc.getPage(pageIndex + 1)
            const base = page.getViewport({ scale: 1 })
            const canvas = document.createElement('canvas')
            await drawPage(page, canvas, { scale: width / base.width, annotations: true }, sig)
            let out: ImageBitmap | HTMLCanvasElement = canvas
            if (typeof createImageBitmap === 'function') {
              try {
                out = await createImageBitmap(canvas)
                canvas.width = 0
                canvas.height = 0
              } catch {
                out = canvas
              }
            }
            this.lru.set(k, out)
            return out
          },
          { priority, signal, key: k },
        )
        .finally(() => this.inflight.delete(k))
      this.inflight.set(k, p)
    } else {
      renderQueue.reprioritize(k, priority)
    }
    return p
  }
}

export const thumbCache = new ThumbCache()

export async function loadThumbnail(
  sourceId: string,
  pageIndex: number,
  width: number,
  opts: { priority?: number; signal?: AbortSignal } = {},
) {
  try {
    return await thumbCache.load(sourceId, pageIndex, width, opts.priority ?? 20, opts.signal)
  } catch (e) {
    if (isAbortError(e)) return null
    throw e
  }
}

export function clearPreviewCache() {
  thumbCache.clear()
}
