import type { OutputFile } from '@/types/common'

/**
 * Build a ZIP archive off the main thread. Already-compressed formats
 * (PDF streams, JPEG, PNG, WebP) are stored without recompression to save CPU.
 */
export async function createZip(files: OutputFile[]): Promise<Blob> {
  const entries = await Promise.all(
    files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })),
  )
  if (typeof Worker === 'undefined') {
    const { zipSync } = await import('fflate')
    const obj: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
    for (const e of entries) obj[e.name] = [e.data, { level: isCompressed(e.name) ? 0 : 6 }]
    return new Blob([zipSync(obj) as BlobPart], { type: 'application/zip' })
  }
  const worker = new Worker(new URL('../../workers/zip.worker.ts', import.meta.url), { type: 'module' })
  try {
    const result = await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; data?: Uint8Array; error?: string }>) =>
        e.data.ok ? resolve(e.data.data!) : reject(new Error(e.data.error))
      worker.onerror = (e) => reject(new Error(e.message || 'ZIP worker failed'))
      worker.postMessage(
        entries.map((e) => ({ ...e, level: isCompressed(e.name) ? 0 : 6 })),
        entries.map((e) => e.data.buffer as ArrayBuffer),
      )
    })
    return new Blob([result as BlobPart], { type: 'application/zip' })
  } finally {
    worker.terminate()
  }
}

function isCompressed(name: string) {
  return /\.(pdf|jpe?g|png|webp|zip|gz)$/i.test(name)
}
