import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { mergePdfs, splitPdf, extractPages, rotatePages, deletePages, getPageCount } from '@/lib/pdf/ops'
import { parsePageRange, parseRangeGroups, formatPageRange } from '@/lib/pdf/page-range'
import { textToPdf, markdownToPdf } from '@/lib/pdf/convert'
import { encryptPdf, unlockPdf, inspectMetadata, stripMetadata } from '@/lib/security/security'
import { compressPdf } from '@/lib/pdf/compress'
import { removeBackgroundFromImageData, findContentBounds } from '@/lib/image/signature'
import { enhanceImageData, SCAN_PRESETS } from '@/lib/image/enhance'
import { classifyDocument, tableToCsv } from '@/lib/pdf/extract'
import { analyzeResume, chunkDocument, extractStructuredEntities, retrieveRelevantChunks } from '@/lib/ai/engine'
import { LRUCache } from '@/lib/performance/lru'
import { TaskQueue } from '@/lib/performance/task-queue'
import { addLibraryFile, clearLocalData, listLibraryFiles } from '@/lib/storage/repo'

async function makeSamplePdf(pageLabels: string[], title = 'Sample PDF') {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle(title)
  doc.setAuthor('PaperFlow Test')
  for (const label of pageLabels) {
    const p = doc.addPage([400, 600])
    p.drawText(label, { x: 40, y: 520, size: 16, font })
  }
  return doc.save()
}

describe('Page range parser', () => {
  it('parses ranges, open bounds, odd/even, and formats back', () => {
    expect(parsePageRange('1-3, 5', 6)).toEqual([0, 1, 2, 4])
    expect(parsePageRange('4-', 6)).toEqual([3, 4, 5])
    expect(parsePageRange('odd', 5)).toEqual([0, 2, 4])
    expect(parsePageRange('even', 5)).toEqual([1, 3])
    expect(parseRangeGroups('1-2, 3-4', 4)).toEqual([[0, 1], [2, 3]])
    expect(formatPageRange([0, 1, 2, 4, 5])).toBe('1-3, 5-6')
  })

  it('rejects out-of-bounds ranges', () => {
    expect(() => parsePageRange('1-9', 5)).toThrow()
  })
})

describe('Core PDF operations (real PDF outputs)', () => {
  it('merges, splits, extracts, rotates, and deletes pages accurately', async () => {
    const pdfA = await makeSamplePdf(['A1', 'A2'], 'Doc A')
    const pdfB = await makeSamplePdf(['B1', 'B2', 'B3'], 'Doc B')

    const merged = await mergePdfs([{ data: pdfA }, { data: pdfB }])
    expect(await getPageCount(merged)).toBe(5)

    const extracted = await extractPages(merged, [0, 2, 4])
    expect(await getPageCount(extracted)).toBe(3)

    const parts = await splitPdf(merged, [[0, 1], [2, 3, 4]])
    expect(parts).toHaveLength(2)
    expect(await getPageCount(parts[0])).toBe(2)
    expect(await getPageCount(parts[1])).toBe(3)

    const rotated = await rotatePages(pdfA, { 0: 90 })
    const loadedRot = await PDFDocument.load(rotated)
    expect(loadedRot.getPage(0).getRotation().angle).toBe(90)

    const deleted = await deletePages(pdfB, [1])
    expect(await getPageCount(deleted)).toBe(2)
  })

  it('converts plain text and Markdown (.md) to valid PDFs', async () => {
    const bytes = await textToPdf('Hello PaperFlow AI.\n\nSecond paragraph here.', { title: 'Test Note' })
    expect(await getPageCount(bytes)).toBe(1)

    const mdBytes = await markdownToPdf(
      '# Project Spec\n\n## Overview\n- Fast local PDF tools\n- Markdown support\n\n> Built for privacy.\n\n```ts\nconst ok = true\n```',
      { title: 'Spec' },
    )
    expect(await getPageCount(mdBytes)).toBe(1)
  })

  it('encrypts with AES-256 and unlocks with valid password', async () => {
    const raw = await makeSamplePdf(['Secret page'])
    const encrypted = await encryptPdf(raw, { userPassword: 'pass123', algorithm: 'AES-256' })

    // Opening without password should fail
    await expect(getPageCount(encrypted)).rejects.toThrow()

    // Unlocking with correct password restores an unencrypted valid PDF
    const unlocked = await unlockPdf(encrypted, 'pass123')
    expect(await getPageCount(unlocked)).toBe(1)
  })

  it('inspects and strips PDF metadata', async () => {
    const raw = await makeSamplePdf(['Page 1'], 'Confidential Title')
    const meta = await inspectMetadata(raw)
    expect(meta.title).toBe('Confidential Title')
    expect(meta.author).toBe('PaperFlow Test')

    const stripped = await stripMetadata(raw)
    const after = await inspectMetadata(stripped)
    expect(after.title).toBe('')
    expect(after.author).toBe('')
  })

  it('runs lossless compression cleanly', async () => {
    const raw = await makeSamplePdf(['Compression test page'])
    const res = await compressPdf(raw, {
      preset: 'light',
      imageQuality: 0.85,
      dpi: 150,
      colorMode: 'color',
      stripMetadata: true,
    })
    expect(res.compressedBytes).toBeGreaterThan(0)
    expect(await getPageCount(res.bytes)).toBe(1)
  })
})

describe('Image processing (Signature bg removal & Scan enhancement)', () => {
  it('removes white background while keeping dark ink opaque', () => {
    // 2x1 image: pixel 0 = white background, pixel 1 = dark blue ink
    const raw = new ImageData(new Uint8ClampedArray([255, 255, 255, 255, 20, 40, 140, 255]), 2, 1)
    const cleaned = removeBackgroundFromImageData(raw, { threshold: 210, feather: 25 })
    expect(cleaned.data[3]).toBe(0) // background transparent
    expect(cleaned.data[7]).toBe(255) // ink opaque

    const bounds = findContentBounds(cleaned, 0)
    expect(bounds).toEqual({ x: 1, y: 0, w: 1, h: 1 })
  })

  it('enhances scan pixels with B&W thresholding', () => {
    const raw = new ImageData(new Uint8ClampedArray([240, 240, 240, 255, 30, 30, 30, 255]), 2, 1)
    const out = enhanceImageData(raw, { preset: 'receipt', ...SCAN_PRESETS.receipt.settings, rotation: 0 })
    expect(out.data[0]).toBe(255)
    expect(out.data[4]).toBe(0)
  })
})

describe('Local Document Intelligence, AI helpers & Performance primitives', () => {
  it('classifies documents, formats CSV, extracts entities, and audits resumes', () => {
    const cv = 'Jane Doe\njane@example.com\nExperience: Built web apps improving speed by 40%.\nEducation: B.Sc CS\nSkills: TypeScript, React'
    expect(classifyDocument(cv, 1).type).toBe('Resume / CV')
    expect(tableToCsv([['Name', 'Role'], ['Alice', 'Engineer, Senior']])).toBe('Name,Role\nAlice,"Engineer, Senior"')

    const entities = extractStructuredEntities('Contact jane@example.com on 12/05/2026 for $1,250.00.')
    expect(entities.emails).toContain('jane@example.com')
    expect(entities.amounts).toContain('$1,250.00')

    const audit = analyzeResume(cv, 'Looking for TypeScript React Docker engineer')
    expect(audit.hasContact).toBe(true)
    expect(audit.hasMetrics).toBe(true)
    expect(audit.matchedKeywords).toContain('typescript')
    expect(audit.missingKeywords).toContain('docker')
  })

  it('chunks and retrieves relevant passages', () => {
    const chunks = chunkDocument([
      { pageIndex: 0, text: 'Quarterly financial revenue grew by twenty percent in Q3.' },
      { pageIndex: 1, text: 'Employee vacation policy allows twenty paid days off per year.' },
    ])
    const top = retrieveRelevantChunks(chunks, 'vacation paid days policy', 1)
    expect(top[0].pageIndex).toBe(1)
  })

  it('enforces LRU eviction and bounded TaskQueue concurrency', async () => {
    const evicted: string[] = []
    const cache = new LRUCache<string, number>(2, (_v, k) => evicted.push(k))
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // 'a' becomes MRU
    cache.set('c', 3) // 'b' evicted
    expect(evicted).toEqual(['b'])

    const q = new TaskQueue(1)
    const order: number[] = []
    await Promise.all([
      q.add(async () => { order.push(1) }, { priority: 10 }),
      q.add(async () => { order.push(2) }, { priority: 1 }),
    ])
    expect(order).toHaveLength(2)
  })

  it('persists and clears files in IndexedDB', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    await addLibraryFile(blob, 'test-local.pdf')
    const list = await listLibraryFiles()
    expect(list.some((f) => f.name === 'test-local.pdf')).toBe(true)
    await clearLocalData('all')
    expect(await listLibraryFiles()).toHaveLength(0)
  })
})
