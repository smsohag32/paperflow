import { loadPdfDoc, loadPdfLib, savePdf } from '@/lib/pdf/pdflib'
import { closePdf, openPdf } from '@/lib/pdf/pdfjs'
import { extractPdfText } from '@/lib/pdf/extract'

export interface PdfMetadataInfo {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate?: string
  modificationDate?: string
  pageCount: number
  isEncrypted: boolean
}

export interface EncryptOptions {
  userPassword: string
  ownerPassword?: string
  algorithm?: 'AES-256' | 'AES-128'
  allowPrinting?: boolean
  allowCopying?: boolean
  allowModifying?: boolean
  allowAnnotating?: boolean
}

export interface SensitiveMatch {
  id: string
  kind: 'email' | 'phone' | 'card' | 'ssn' | 'iban' | 'custom'
  value: string
  pageIndex: number
  /** Masked preview for safe display */
  preview: string
}

export async function inspectMetadata(
  file: Blob | Uint8Array,
  password?: string,
): Promise<PdfMetadataInfo> {
  const doc = await loadPdfDoc(file, { password, updateMetadata: false })
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: doc.getCreationDate()?.toISOString(),
    modificationDate: doc.getModificationDate()?.toISOString(),
    pageCount: doc.getPageCount(),
    isEncrypted: doc.isEncrypted,
  }
}

export async function updateMetadata(
  file: Blob | Uint8Array,
  meta: Partial<Pick<PdfMetadataInfo, 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer'>>,
  password?: string,
): Promise<Uint8Array> {
  const doc = await loadPdfDoc(file, { password, updateMetadata: false })
  if (meta.title !== undefined) doc.setTitle(meta.title)
  if (meta.author !== undefined) doc.setAuthor(meta.author)
  if (meta.subject !== undefined) doc.setSubject(meta.subject)
  if (meta.keywords !== undefined) {
    doc.setKeywords(
      meta.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    )
  }
  if (meta.creator !== undefined) doc.setCreator(meta.creator)
  if (meta.producer !== undefined) doc.setProducer(meta.producer)
  return savePdf(doc)
}

export async function stripMetadata(file: Blob | Uint8Array, password?: string): Promise<Uint8Array> {
  return updateMetadata(
    file,
    { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' },
    password,
  )
}

/**
 * Genuine PDF encryption using @cantoo/pdf-lib (AES-256 by default, ISO 32000-2).
 */
export async function encryptPdf(
  file: Blob | Uint8Array,
  opts: EncryptOptions,
  currentPassword?: string,
): Promise<Uint8Array> {
  if (!opts.userPassword && !opts.ownerPassword) {
    throw new Error('Provide at least a user password or an owner password.')
  }
  const doc = await loadPdfDoc(file, { password: currentPassword, updateMetadata: false })
  doc.encrypt({
    userPassword: opts.userPassword,
    ownerPassword: opts.ownerPassword || opts.userPassword,
    algorithm: opts.algorithm ?? 'AES-256',
    permissions: {
      printing: opts.allowPrinting ? 'highResolution' : false,
      copying: opts.allowCopying ?? false,
      modifying: opts.allowModifying ?? false,
      annotating: opts.allowAnnotating ?? false,
      fillingForms: opts.allowAnnotating ?? false,
      contentAccessibility: true,
      documentAssembly: opts.allowModifying ?? false,
    },
  })
  return savePdf(doc)
}

/**
 * Authorized PDF unlock: requires the valid password, decrypts and saves an unencrypted copy.
 * Never attempts to bypass encryption without authorization.
 */
export async function unlockPdf(file: Blob | Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Enter the document password to unlock it.')
  const doc = await loadPdfDoc(file, { password, updateMetadata: false })
  return savePdf(doc)
}

const PATTERNS: { kind: SensitiveMatch['kind']; regex: RegExp }[] = [
  { kind: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'phone', regex: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g },
  { kind: 'card', regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { kind: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'iban', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
]

function maskValue(v: string) {
  if (v.length <= 4) return '••••'
  return `${v.slice(0, 2)}${'•'.repeat(Math.min(8, v.length - 4))}${v.slice(-2)}`
}

export async function detectSensitiveInfo(
  file: Blob | Uint8Array,
  opts: { password?: string; customTerms?: string[] } = {},
): Promise<SensitiveMatch[]> {
  const pages = await extractPdfText(file, { password: opts.password })
  const matches: SensitiveMatch[] = []
  let seq = 0

  for (const p of pages) {
    for (const { kind, regex } of PATTERNS) {
      regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(p.text)) !== null) {
        const val = m[0].trim()
        if (kind === 'card') {
          const digits = val.replace(/\D/g, '')
          if (digits.length < 13 || digits.length > 16 || !luhnCheck(digits)) continue
        }
        matches.push({
          id: `pii_${seq++}`,
          kind,
          value: val,
          pageIndex: p.pageIndex,
          preview: maskValue(val),
        })
      }
    }

    for (const term of opts.customTerms ?? []) {
      const clean = term.trim()
      if (!clean) continue
      const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(esc, 'gi')
      let m: RegExpExecArray | null
      while ((m = re.exec(p.text)) !== null) {
        matches.push({
          id: `pii_${seq++}`,
          kind: 'custom',
          value: m[0],
          pageIndex: p.pageIndex,
          preview: maskValue(m[0]),
        })
      }
    }
  }
  return matches
}

function luhnCheck(num: string) {
  let sum = 0
  let alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10)
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export interface RedactionBox {
  pageIndex: number
  /** Normalized 0..1 top-left coordinates */
  x: number
  y: number
  w: number
  h: number
}

/**
 * Genuine permanent redaction:
 * Locates matching text spans (via PDF.js text coordinates) and/or explicit boxes,
 * then rasterizes affected pages and permanently paints black rectangles into the
 * pixel buffer so the original text operators and underlying image data are completely
 * destroyed in the exported PDF. Un-redacted pages remain untouched vector PDF pages.
 */
export async function applyPermanentRedaction(
  file: Blob | Uint8Array,
  opts: {
    terms?: string[]
    boxes?: RedactionBox[]
    password?: string
    onProgress?: (p: number) => void
  },
): Promise<{ bytes: Uint8Array; redactedPages: number[]; boxesApplied: number }> {
  const inputBytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
  const pdf = await openPdf(inputBytes, { password: opts.password })
  const boxesByPage = new Map<number, RedactionBox[]>()

  for (const b of opts.boxes ?? []) {
    const arr = boxesByPage.get(b.pageIndex) ?? []
    arr.push(b)
    boxesByPage.set(b.pageIndex, arr)
  }

  const terms = (opts.terms ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)

  try {
    if (terms.length > 0) {
      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1)
        const vp = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue
          const lower = item.str.toLowerCase()
          const matched = terms.some((t) => lower.includes(t))
          if (!matched) continue
          const tx = item.transform
          const fontH = Math.max(8, Math.hypot(tx[2], tx[3]))
          const x = tx[4] / vp.width
          const w = Math.max(item.width, fontH * 0.6) / vp.width
          const yTop = (vp.height - tx[5] - fontH * 0.95) / vp.height
          const h = (fontH * 1.25) / vp.height
          const arr = boxesByPage.get(i) ?? []
          arr.push({
            pageIndex: i,
            x: Math.max(0, x - 0.004),
            y: Math.max(0, yTop - 0.003),
            w: Math.min(1, w + 0.008),
            h: Math.min(1, h + 0.006),
          })
          boxesByPage.set(i, arr)
        }
      }
    }

    const { PDFDocument } = await loadPdfLib()
    const srcDoc = await loadPdfDoc(inputBytes, { password: opts.password })
    const outDoc = await PDFDocument.create()
    const redactedPages: number[] = []
    let boxesApplied = 0

    for (let i = 0; i < pdf.numPages; i++) {
      const pageBoxes = boxesByPage.get(i)
      if (!pageBoxes || pageBoxes.length === 0) {
        const [copied] = await outDoc.copyPages(srcDoc, [i])
        outDoc.addPage(copied)
      } else {
        redactedPages.push(i)
        boxesApplied += pageBoxes.length
        const page = await pdf.getPage(i + 1)
        const baseVp = page.getViewport({ scale: 1 })
        const scale = 2
        const vp = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(vp.width))
        canvas.height = Math.max(1, Math.floor(vp.height))
        const ctx = canvas.getContext('2d', { alpha: false })!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise

        ctx.fillStyle = '#000000'
        for (const b of pageBoxes) {
          ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height)
        }

        const jpgBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Redaction render failed'))), 'image/jpeg', 0.92),
        )
        canvas.width = 0
        canvas.height = 0
        const jpg = await outDoc.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()))
        const outPage = outDoc.addPage([baseVp.width, baseVp.height])
        outPage.drawImage(jpg, { x: 0, y: 0, width: baseVp.width, height: baseVp.height })
      }
      opts.onProgress?.((i + 1) / pdf.numPages)
    }

    outDoc.setProducer('PaperFlow AI')
    return { bytes: await savePdf(outDoc), redactedPages, boxesApplied }
  } finally {
    await closePdf(pdf)
  }
}
