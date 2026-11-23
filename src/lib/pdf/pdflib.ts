import type { PDFDocument as PDFDocumentType } from '@cantoo/pdf-lib'

/** Lazy pdf-lib import (kept out of the initial bundle). */
export async function loadPdfLib() {
  return import('@cantoo/pdf-lib')
}

export async function toBytes(data: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(await data.arrayBuffer())
}

export class EncryptedPdfError extends Error {
  constructor() {
    super('This PDF is password protected. Unlock it first (Security → Unlock) or provide the password.')
    this.name = 'EncryptedPdfError'
  }
}

/** Load with pdf-lib; surfaces encrypted docs as a typed error. */
export async function loadPdfDoc(
  data: Blob | ArrayBuffer | Uint8Array,
  opts: { password?: string; updateMetadata?: boolean } = {},
): Promise<PDFDocumentType> {
  const { PDFDocument } = await loadPdfLib()
  const bytes = await toBytes(data)
  try {
    const doc = await PDFDocument.load(bytes, {
      password: opts.password,
      ignoreEncryption: false,
      updateMetadata: opts.updateMetadata ?? false,
      throwOnInvalidObject: false,
    })
    return doc
  } catch (e) {
    const msg = (e as Error)?.message ?? ''
    if (/encrypt/i.test(msg) || /password/i.test(msg)) throw new EncryptedPdfError()
    throw new Error(`Could not read this PDF: ${msg || 'unknown error'}`, { cause: e })
  }
}

export async function savePdf(doc: PDFDocumentType, opts: { objectStreams?: boolean } = {}) {
  return doc.save({ useObjectStreams: opts.objectStreams ?? true, addDefaultPage: false })
}
