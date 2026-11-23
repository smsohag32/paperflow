import { test, expect } from '@playwright/test'

const ROUTES = [
  { path: '/', heading: /Good (morning|afternoon|evening)/i },
  { path: '/tools', heading: /Tools & Library/i },
  { path: '/workspace', heading: /PDF Workspace/i },
  { path: '/merge', heading: /Merge PDF/i },
  { path: '/split', heading: /Split & Extract PDF/i },
  { path: '/compress', heading: /Compression Studio/i },
  { path: '/sign', heading: /Signature Studio/i },
  { path: '/ocr', heading: /OCR & Searchable PDF/i },
  { path: '/convert', heading: /Convert Studio/i },
  { path: '/enhance', heading: /Scan Enhancement Studio/i },
  { path: '/ai', heading: /Local AI Workspace/i },
  { path: '/protect', heading: /Security & Permanent Redaction/i },
  { path: '/extract', heading: /Extract & Document Intelligence/i },
  { path: '/settings', heading: /Settings & Performance/i },
  { path: '/privacy', heading: /Privacy Dashboard/i },
]

for (const r of ROUTES) {
  test(`renders route ${r.path}`, async ({ page }) => {
    await page.goto(r.path)
    await expect(page.getByRole('heading', { name: r.heading })).toBeVisible()
  })
}
