import { degrees, type PDFDocument } from '@cantoo/pdf-lib'
import { loadPdfDoc, loadPdfLib, savePdf } from './pdflib'
import type { Rotation } from '@/types/common'

export interface PdfInput {
  data: Blob | ArrayBuffer | Uint8Array
  name?: string
  password?: string
  /** Optional subset/order of pages (zero-based). Defaults to all pages. */
  pages?: number[]
  /** Optional additional rotation per page index (applies after copy). */
  rotations?: Record<number, Rotation>
}

/** Merge multiple PDFs (optionally page subsets) into one. */
export async function mergePdfs(inputs: PdfInput[], onProgress?: (p: number) => void): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    const src = await loadPdfDoc(input.data, { password: input.password })
    const indices = input.pages ?? src.getPageIndices()
    const copied = await out.copyPages(src, indices)
    copied.forEach((p, j) => {
      const extra = input.rotations?.[indices[j]] ?? 0
      if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360))
      out.addPage(p)
    })
    onProgress?.((i + 1) / inputs.length)
  }
  out.setProducer('PaperFlow AI')
  out.setCreator('PaperFlow AI')
  return savePdf(out)
}

/** Extract pages (zero-based, in the given order) into a new PDF. */
export async function extractPages(
  data: Blob | ArrayBuffer | Uint8Array | PDFDocument,
  indices: number[],
  opts: { password?: string } = {},
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const src = data instanceof PDFDocument ? data : await loadPdfDoc(data, { password: opts.password })
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  pages.forEach((p) => out.addPage(p))
  copyInfo(src, out)
  return savePdf(out)
}

/** Split into multiple documents according to groups of page indices. */
export async function splitPdf(
  data: Blob | ArrayBuffer | Uint8Array,
  groups: number[][],
  opts: { password?: string; onProgress?: (p: number) => void } = {},
): Promise<Uint8Array[]> {
  const src = await loadPdfDoc(data, { password: opts.password })
  const out: Uint8Array[] = []
  for (let i = 0; i < groups.length; i++) {
    out.push(await extractPages(src, groups[i]))
    opts.onProgress?.((i + 1) / groups.length)
  }
  return out
}

/** Split every N pages. */
export function chunkGroups(pageCount: number, size: number): number[][] {
  const groups: number[][] = []
  for (let i = 0; i < pageCount; i += size) {
    groups.push(Array.from({ length: Math.min(size, pageCount - i) }, (_, k) => i + k))
  }
  return groups
}

/** Rotate pages in place (by additional degrees). */
export async function rotatePages(
  data: Blob | ArrayBuffer | Uint8Array,
  rotations: Record<number, number>,
  opts: { password?: string } = {},
) {
  const doc = await loadPdfDoc(data, { password: opts.password })
  doc.getPages().forEach((p, i) => {
    const r = rotations[i]
    if (r) p.setRotation(degrees((((p.getRotation().angle + r) % 360) + 360) % 360))
  })
  return savePdf(doc)
}

/** Remove pages by index. */
export async function deletePages(data: Blob | ArrayBuffer | Uint8Array, remove: number[]) {
  const doc = await loadPdfDoc(data)
  const total = doc.getPageCount()
  const keep = doc.getPageIndices().filter((i) => !remove.includes(i))
  if (keep.length === 0) throw new Error('A PDF must keep at least one page.')
  return extractPages(doc, keep.length === total ? doc.getPageIndices() : keep)
}

export async function getPageCount(data: Blob | ArrayBuffer | Uint8Array, password?: string) {
  const doc = await loadPdfDoc(data, { password })
  return doc.getPageCount()
}

function copyInfo(src: PDFDocument, out: PDFDocument) {
  try {
    const t = src.getTitle()
    if (t) out.setTitle(t)
    const a = src.getAuthor()
    if (a) out.setAuthor(a)
  } catch {
    /* metadata is optional */
  }
  out.setProducer('PaperFlow AI')
}
