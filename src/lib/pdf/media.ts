import { PDFDict, PDFName, PDFRawStream, PDFRef } from '@cantoo/pdf-lib'
import { loadPdfDoc, savePdf } from './pdflib'
import { closePdf, openPdf } from './pdfjs'

export interface ExtractedPdfImage {
  /** Unique key (PDF object ref like "12 0 R" or fallback synthetic key) */
  id: string
  /** PDF object ref string if backed by a PDFRef, enabling in-place replace/remove */
  refKey?: string
  /** Resource name inside page XObject dict (e.g. "Im0") */
  name: string
  /** 1-based page numbers where this image appears */
  pages: number[]
  width: number
  height: number
  /** Detected original encoding format */
  format: 'jpeg' | 'png'
  mimeType: 'image/jpeg' | 'image/png'
  /** Byte size of the extracted image blob */
  bytes: number
  /** Ready-to-download Blob */
  blob: Blob
  /** Object URL for preview (caller should revoke on cleanup) */
  previewUrl: string
}

export interface PdfMediaExtractionResult {
  pageCount: number
  images: ExtractedPdfImage[]
}

export type ImageExportFormat = 'original' | 'png' | 'jpeg' | 'webp'

function getFilterName(dict: PDFDict): string {
  const filter = dict.get(PDFName.of('Filter'))
  if (!filter) return ''
  return filter.toString()
}

function getDictNumber(dict: PDFDict, key: string): number {
  const v = dict.get(PDFName.of(key))
  if (!v) return 0
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : 0
}

/**
 * Decode a non-JPEG PDF image object via pdf.js into a lossless PNG Blob.
 */
async function decodePdfJsImageToPng(imgObj: {
  width: number
  height: number
  data?: Uint8ClampedArray | Uint8Array
  kind?: number
  bitmap?: ImageBitmap
}): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const w = imgObj.width
  const h = imgObj.height
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (imgObj.bitmap) {
    ctx.drawImage(imgObj.bitmap, 0, 0, w, h)
  } else if (imgObj.data) {
    const imgData = ctx.createImageData(w, h)
    const dst = imgData.data
    const src = imgObj.data
    const pixelCount = w * h

    if (src.length === pixelCount * 4) {
      dst.set(src)
    } else if (src.length === pixelCount * 3) {
      for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
        dst[j] = src[i]
        dst[j + 1] = src[i + 1]
        dst[j + 2] = src[i + 2]
        dst[j + 3] = 255
      }
    } else if (src.length === pixelCount) {
      for (let i = 0, j = 0; i < src.length; i++, j += 4) {
        const v = src[i]
        dst[j] = v
        dst[j + 1] = v
        dst[j + 2] = v
        dst[j + 3] = 255
      }
    } else {
      // 1-bit grayscale packed mask fallback
      for (let i = 0; i < pixelCount; i++) {
        const byte = src[i >> 3] ?? 0
        const bit = (byte >> (7 - (i & 7))) & 1
        const v = bit ? 255 : 0
        const j = i * 4
        dst[j] = v
        dst[j + 1] = v
        dst[j + 2] = v
        dst[j + 3] = 255
      }
    }
    ctx.putImageData(imgData, 0, 0)
  } else {
    return null
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  canvas.width = 0
  canvas.height = 0
  return blob
}

/**
 * Extract all embedded images from a PDF.
 * - Extracts original untouched JPEG streams directly via pdf-lib when /DCTDecode is used.
 * - Decodes Flate/other image streams cleanly via pdf.js into lossless PNG.
 * - Deduplicates shared image XObjects across pages while recording every page they appear on.
 */
export async function extractPdfImages(
  file: Blob | Uint8Array,
  opts?: { password?: string; onProgress?: (progress: number, status: string) => void },
): Promise<PdfMediaExtractionResult> {
  const rawBytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
  opts?.onProgress?.(0.05, 'Inspecting PDF structure…')

  const pdfLibDoc = await loadPdfDoc(rawBytes, { password: opts?.password, updateMetadata: false })
  const pages = pdfLibDoc.getPages()
  const pageCount = pages.length

  // Step 1: Walk XObjects via pdf-lib to capture exact PDFRef, dimensions, and raw JPEG streams
  interface RefCandidate {
    refKey: string
    name: string
    pages: number[]
    width: number
    height: number
    jpegBytes?: Uint8Array
  }

  const refMap = new Map<string, RefCandidate>()

  const inspectXObjectDict = (xObjDict: PDFDict, pageNum: number, depth = 0) => {
    if (depth > 4) return
    for (const [keyObj, valObj] of xObjDict.entries()) {
      const name = keyObj.asString().replace(/^\//, '')
      const refKey = valObj instanceof PDFRef ? `${valObj.objectNumber} ${valObj.generationNumber} R` : ''
      const resolved = pdfLibDoc.context.lookup(valObj)
      if (!(resolved instanceof PDFRawStream)) continue
      const dict = resolved.dict
      const subtype = dict.get(PDFName.of('Subtype'))?.toString()

      if (subtype === '/Image') {
        const mapKey = refKey || `inline-p${pageNum}-${name}`
        const existing = refMap.get(mapKey)
        if (existing) {
          if (!existing.pages.includes(pageNum)) existing.pages.push(pageNum)
          continue
        }
        const width = getDictNumber(dict, 'Width')
        const height = getDictNumber(dict, 'Height')
        const filterStr = getFilterName(dict)
        const isPureJpeg = filterStr === '/DCTDecode' || filterStr === '[ /DCTDecode ]'
        refMap.set(mapKey, {
          refKey,
          name,
          pages: [pageNum],
          width,
          height,
          jpegBytes: isPureJpeg ? new Uint8Array(resolved.contents) : undefined,
        })
      } else if (subtype === '/Form') {
        const subRes = dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
        const subXObj = subRes?.lookupMaybe(PDFName.of('XObject'), PDFDict)
        if (subXObj) inspectXObjectDict(subXObj, pageNum, depth + 1)
      }
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const res = pages[i].node.lookupMaybe(PDFName.of('Resources'), PDFDict)
    const xObjs = res?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (xObjs) inspectXObjectDict(xObjs, i + 1)
  }

  const results: ExtractedPdfImage[] = []
  const handledNames = new Set<string>()

  // Immediately create ExtractedPdfImage for pure JPEG streams (100% original bytes, no re-encode!)
  for (const [key, cand] of refMap.entries()) {
    if (cand.jpegBytes && cand.jpegBytes.byteLength > 0) {
      const blob = new Blob([cand.jpegBytes.buffer as ArrayBuffer], { type: 'image/jpeg' })
      results.push({
        id: key,
        refKey: cand.refKey || undefined,
        name: cand.name,
        pages: cand.pages,
        width: cand.width,
        height: cand.height,
        format: 'jpeg',
        mimeType: 'image/jpeg',
        bytes: blob.size,
        blob,
        previewUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '',
      })
      handledNames.add(cand.name)
    }
  }

  // Step 2: If there are non-JPEG images (PNG/Flate/CMYK/masked), decode them cleanly via pdf.js
  const hasUndecoded = Array.from(refMap.values()).some((c) => !c.jpegBytes)
  const canCanvasDecode =
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    !navigator.userAgent?.toLowerCase().includes('jsdom')

  if (hasUndecoded && canCanvasDecode) {
    try {
      const pdfJsDoc = await openPdf(rawBytes, { password: opts?.password })
      try {
        const seenPdfJsIds = new Set<string>()
        for (let pNum = 1; pNum <= pdfJsDoc.numPages; pNum++) {
          opts?.onProgress?.(0.15 + (pNum / pdfJsDoc.numPages) * 0.8, `Scanning page ${pNum} of ${pdfJsDoc.numPages}…`)
          const page = await pdfJsDoc.getPage(pNum)
          const opList = await page.getOperatorList()
          // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82
          for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i]
            if (fn !== 85 && fn !== 82) continue
            const objName = String(opList.argsArray[i]?.[0] ?? '')
            if (!objName || seenPdfJsIds.has(objName)) continue

            const matchedCand = Array.from(refMap.values()).find(
              (c) => !c.jpegBytes && (c.name === objName || objName.endsWith(`_${c.name}`) || c.pages.includes(pNum)),
            )
            if (handledNames.has(objName)) continue
            seenPdfJsIds.add(objName)

            try {
              const imgObj = await new Promise<unknown>((resolve) => {
                if (page.objs.has(objName)) {
                  resolve(page.objs.get(objName))
                } else if (page.commonObjs.has(objName)) {
                  resolve(page.commonObjs.get(objName))
                } else {
                  const timer = setTimeout(() => resolve(null), 1500)
                  page.objs.get(objName, (data: unknown) => {
                    clearTimeout(timer)
                    resolve(data)
                  })
                }
              })
              if (!imgObj || typeof imgObj !== 'object') continue
              const typed = imgObj as { width: number; height: number; data?: Uint8ClampedArray; bitmap?: ImageBitmap }
              const pngBlob = await decodePdfJsImageToPng(typed)
              if (!pngBlob) continue

              const id = matchedCand?.refKey || `pdfjs-${pNum}-${objName}`
              if (results.some((r) => r.id === id)) continue

              results.push({
                id,
                refKey: matchedCand?.refKey || undefined,
                name: matchedCand?.name || objName,
                pages: matchedCand?.pages ?? [pNum],
                width: typed.width || matchedCand?.width || 0,
                height: typed.height || matchedCand?.height || 0,
                format: 'png',
                mimeType: 'image/png',
                bytes: pngBlob.size,
                blob: pngBlob,
                previewUrl: URL.createObjectURL(pngBlob),
              })
            } catch {
              // Skip unreadable image object
            }
          }
        }
      } finally {
        await closePdf(pdfJsDoc)
      }
    } catch {
      // Fall through to metadata fallback if pdf.js cannot decode in this environment
    }
  }

  // Fallback for any undecoded non-JPEG XObjects (e.g. headless/jsdom environments)
  if (!canCanvasDecode) {
    for (const [key, cand] of refMap.entries()) {
      if (cand.jpegBytes || results.some((r) => r.id === key)) continue
      const blob = new Blob([new Uint8Array(0)], { type: 'image/png' })
      results.push({
        id: key,
        refKey: cand.refKey || undefined,
        name: cand.name,
        pages: cand.pages,
        width: cand.width,
        height: cand.height,
        format: 'png',
        mimeType: 'image/png',
        bytes: 0,
        blob,
        previewUrl: '',
      })
    }
  }

  results.sort((a, b) => (a.pages[0] ?? 0) - (b.pages[0] ?? 0) || b.width * b.height - a.width * a.height)
  opts?.onProgress?.(1, `Found ${results.length} image(s)`)
  return { pageCount, images: results }
}

/**
 * Convert an extracted image Blob to PNG / JPEG / WebP (or return original untouched).
 */
export async function convertImageBlob(
  img: ExtractedPdfImage,
  targetFormat: ImageExportFormat,
  quality = 0.9,
): Promise<{ blob: Blob; ext: string }> {
  if (targetFormat === 'original') {
    return { blob: img.blob, ext: img.format === 'jpeg' ? 'jpg' : 'png' }
  }
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return { blob: img.blob, ext: img.format === 'jpeg' ? 'jpg' : 'png' }
  }
  const bmp = await createImageBitmap(img.blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  if (targetFormat === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const mime = targetFormat === 'jpeg' ? 'image/jpeg' : targetFormat === 'webp' ? 'image/webp' : 'image/png'
  const outBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image conversion failed'))), mime, quality),
  )
  canvas.width = 0
  canvas.height = 0
  return { blob: outBlob, ext: targetFormat === 'jpeg' ? 'jpg' : targetFormat }
}

// 1x1 transparent PNG (67 bytes) used to cleanly blank out removed image XObjects without breaking page streams
const TRANSPARENT_1X1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 2, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130,
])

/**
 * Remove or replace specific embedded images in a PDF by their `refKey` while keeping
 * all selectable text, vector graphics, and layout 100% intact.
 */
export async function applyPdfImageEdits(
  file: Blob | Uint8Array,
  edits: {
    removeRefKeys?: string[]
    replacements?: Record<string, { bytes: Uint8Array; mimeType: string }>
    password?: string
  },
): Promise<Uint8Array> {
  const rawBytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
  const doc = await loadPdfDoc(rawBytes, { password: edits.password, updateMetadata: false })

  const removeSet = new Set(edits.removeRefKeys ?? [])
  const replaceMap = new Map<string, PDFRef>()

  // Embed replacement images and collect their new PDFRef
  if (edits.replacements) {
    for (const [refKey, rep] of Object.entries(edits.replacements)) {
      const isPng = rep.mimeType.includes('png')
      const embedded = isPng ? await doc.embedPng(rep.bytes) : await doc.embedJpg(rep.bytes)
      replaceMap.set(refKey, embedded.ref)
    }
  }

  // Embed a single 1x1 transparent placeholder if any image is being removed
  let blankRef: PDFRef | null = null
  if (removeSet.size > 0) {
    const blankImg = await doc.embedPng(TRANSPARENT_1X1_PNG)
    blankRef = blankImg.ref
  }

  const rewriteXObjects = (xObjDict: PDFDict, depth = 0) => {
    if (depth > 4) return
    for (const [keyObj, valObj] of xObjDict.entries()) {
      if (valObj instanceof PDFRef) {
        const refKey = `${valObj.objectNumber} ${valObj.generationNumber} R`
        const repRef = replaceMap.get(refKey)
        if (repRef) {
          xObjDict.set(keyObj, repRef)
          continue
        }
        if (removeSet.has(refKey) && blankRef) {
          xObjDict.set(keyObj, blankRef)
          continue
        }
      }
      const resolved = doc.context.lookup(valObj)
      if (resolved instanceof PDFRawStream) {
        const subtype = resolved.dict.get(PDFName.of('Subtype'))?.toString()
        if (subtype === '/Form') {
          const subRes = resolved.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
          const subXObj = subRes?.lookupMaybe(PDFName.of('XObject'), PDFDict)
          if (subXObj) rewriteXObjects(subXObj, depth + 1)
        }
      }
    }
  }

  for (const page of doc.getPages()) {
    const res = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict)
    const xObjs = res?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (xObjs) rewriteXObjects(xObjs)
  }

  return savePdf(doc, { objectStreams: true })
}
