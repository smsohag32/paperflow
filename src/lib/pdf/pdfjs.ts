import type * as PdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type Pdfjs = typeof PdfjsLib

let pdfjsPromise: Promise<Pdfjs> | null = null

/**
 * Lazily load PDF.js and its worker. Never imported at startup.
 */
export function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })().catch((e) => {
      pdfjsPromise = null
      throw e
    })
  }
  return pdfjsPromise
}

export class PasswordRequiredError extends Error {
  incorrect: boolean
  constructor(incorrect: boolean) {
    super(incorrect ? 'Incorrect password.' : 'This PDF is password protected.')
    this.name = 'PasswordRequiredError'
    this.incorrect = incorrect
  }
}

export class InvalidPdfError extends Error {
  constructor(message = 'This file is not a valid PDF or it is damaged.') {
    super(message)
    this.name = 'InvalidPdfError'
  }
}

/**
 * Open a PDF with PDF.js. Data is copied into a fresh buffer because PDF.js
 * transfers it to its worker.
 */
export async function openPdf(
  data: Blob | ArrayBuffer | Uint8Array,
  opts: { password?: string } = {},
): Promise<PDFDocumentProxy> {
  const lib = await loadPdfjs()
  const bytes =
    data instanceof Blob
      ? new Uint8Array(await data.arrayBuffer())
      : data instanceof Uint8Array
        ? data.slice()
        : new Uint8Array(data.slice(0))
  if (bytes.byteLength === 0) throw new InvalidPdfError('This file is empty.')
  const task = lib.getDocument({
    data: bytes,
    password: opts.password,
    enableXfa: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    stopAtErrors: false,
    standardFontDataUrl: undefined,
  })
  try {
    return await task.promise
  } catch (err: unknown) {
    const e = err as { name?: string; code?: number; message?: string }
    if (e?.name === 'PasswordException') {
      // code 1 = need password, 2 = incorrect password
      throw new PasswordRequiredError(e.code === 2)
    }
    if (e?.name === 'InvalidPDFException' || e?.name === 'FormatError') throw new InvalidPdfError()
    throw new InvalidPdfError(e?.message ? `Could not open PDF: ${e.message}` : undefined)
  }
}

/** Safely release PDF.js document resources across v5/v6 APIs. */
export async function closePdf(pdf: PDFDocumentProxy): Promise<void> {
  try {
    const p = pdf as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> }
    if (typeof p.destroy === 'function') await p.destroy()
    else if (typeof p.cleanup === 'function') await p.cleanup()
  } catch {
    /* ignore */
  }
}

/** Quick header sniff: is this plausibly a PDF? */
export async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const text = String.fromCharCode(...head)
  return text.includes('%PDF-')
}
