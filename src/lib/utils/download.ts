import { sanitizeFileName } from './format'
import type { OutputFile } from '@/types/common'

/** Trigger a browser download for a Blob using an object URL (no base64). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFileName(filename)
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function pdfBlob(bytes: Uint8Array | ArrayBuffer) {
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/** Ensure unique names inside a ZIP/batch. */
export function uniqueNames(files: OutputFile[]): OutputFile[] {
  const seen = new Map<string, number>()
  return files.map((f) => {
    const name = sanitizeFileName(f.name)
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    if (n === 0) return { ...f, name }
    const dot = name.lastIndexOf('.')
    const renamed = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
    return { ...f, name: renamed }
  })
}

/** Download one file directly, or several as a ZIP built in a worker. */
export async function downloadOutputs(files: OutputFile[], zipName = 'paperflow-export.zip') {
  if (files.length === 0) return
  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].name)
    return
  }
  const { createZip } = await import('./zip')
  const zip = await createZip(uniqueNames(files))
  downloadBlob(zip, zipName)
}
