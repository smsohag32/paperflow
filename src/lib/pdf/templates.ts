import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from '@cantoo/pdf-lib'
import { loadPdfLib, savePdf } from './pdflib'

export type TemplateKind = 'invoice' | 'resume' | 'certificate' | 'letterhead'
export type TemplateFont = 'sans' | 'serif' | 'mono'
export type InvoiceStyle = 'modern' | 'classic' | 'minimal'
export type ResumeStyle = 'modern' | 'executive' | 'classic'
export type CertificateStyle = 'classic-gold' | 'modern-indigo' | 'royal-emerald'
export type LetterheadStyle = 'corporate' | 'editorial' | 'minimal'

export interface TemplateTheme {
  accentColor: string
  font: TemplateFont
  fontScale: number // 0.85 .. 1.15
  logoDataUrl?: string
  signatureDataUrl?: string
}

export interface TemplateProject {
  id: string
  kind: TemplateKind
  title: string
  /** true when user explicitly clicked Save; false for automatic drafts */
  saved: boolean
  createdAt: number
  updatedAt: number
  theme: TemplateTheme
  invoice: InvoiceData
  resume: ResumeData
  certificate: CertificateData
  letterhead: LetterheadData
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  rate: number
}

export interface InvoiceData {
  style: InvoiceStyle
  invoiceNumber: string
  status: 'UNPAID' | 'PAID' | 'DRAFT' | 'OVERDUE'
  issueDate: string
  dueDate: string
  currency: string
  fromName: string
  fromEmail: string
  fromPhone: string
  fromAddress: string
  toName: string
  toCompany: string
  toEmail: string
  toAddress: string
  items: InvoiceItem[]
  discountType: 'percent' | 'fixed'
  discountValue: number
  taxRate: number
  shipping: number
  notes: string
  paymentTerms: string
  signerName: string
}

export interface ResumeExperience {
  id: string
  role: string
  company: string
  location: string
  period: string
  bullets: string
}

export interface ResumeEducation {
  id: string
  degree: string
  school: string
  period: string
  details: string
}

export interface ResumeProject {
  id: string
  name: string
  link: string
  description: string
}

export interface ResumeData {
  style: ResumeStyle
  fullName: string
  headline: string
  email: string
  phone: string
  location: string
  website: string
  summary: string
  skills: string
  languages: string
  experience: ResumeExperience[]
  education: ResumeEducation[]
  projects: ResumeProject[]
}

export interface CertificateData {
  style: CertificateStyle
  organization: string
  title: string
  subtitle: string
  recipientName: string
  description: string
  courseOrEvent: string
  issueDate: string
  certificateId: string
  signer1Name: string
  signer1Title: string
  signer2Name: string
  signer2Title: string
}

export interface LetterheadData {
  style: LetterheadStyle
  companyName: string
  tagline: string
  companyAddress: string
  companyContact: string
  referenceNo: string
  date: string
  recipientName: string
  recipientTitle: string
  recipientOrg: string
  recipientAddress: string
  subject: string
  salutation: string
  body: string
  closing: string
  senderName: string
  senderTitle: string
}

export const CURRENCIES = [
  { code: 'USD', symbol: '$', pdfSymbol: '$', label: 'USD ($)' },
  { code: 'BDT', symbol: '৳', pdfSymbol: 'BDT ', label: 'BDT (৳)' },
  { code: 'EUR', symbol: '€', pdfSymbol: 'EUR ', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', pdfSymbol: '£', label: 'GBP (£)' },
  { code: 'INR', symbol: '₹', pdfSymbol: 'INR ', label: 'INR (₹)' },
  { code: 'CAD', symbol: 'CA$', pdfSymbol: 'CA$', label: 'CAD (CA$)' },
  { code: 'AUD', symbol: 'A$', pdfSymbol: 'A$', label: 'AUD (A$)' },
] as const

export const ACCENT_PRESETS = [
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Slate', hex: '#1e293b' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Royal Blue', hex: '#1d4ed8' },
  { name: 'Crimson', hex: '#be123c' },
  { name: 'Amber Gold', hex: '#b45309' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Violet', hex: '#7c3aed' },
]

export function getCurrencyMeta(code: string) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
}

export function formatMoney(amount: number, currencyCode: string, forPdf = false): string {
  const meta = getCurrencyMeta(currencyCode)
  const sym = forPdf ? meta.pdfSymbol : meta.symbol
  const num = Number.isFinite(amount) ? amount : 0
  return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function computeInvoiceTotals(data: InvoiceData) {
  const subtotal = data.items.reduce((sum, it) => sum + Math.max(0, it.quantity) * Math.max(0, it.rate), 0)
  const discountAmount =
    data.discountType === 'percent'
      ? subtotal * (Math.min(100, Math.max(0, data.discountValue)) / 100)
      : Math.min(subtotal, Math.max(0, data.discountValue))
  const taxable = Math.max(0, subtotal - discountAmount)
  const taxAmount = taxable * (Math.max(0, data.taxRate) / 100)
  const shipping = Math.max(0, data.shipping)
  const grandTotal = taxable + taxAmount + shipping
  return { subtotal, discountAmount, taxAmount, shipping, grandTotal }
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const plusDaysIso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)

export function createDefaultTheme(): TemplateTheme {
  return {
    accentColor: '#4f46e5',
    font: 'sans',
    fontScale: 1,
  }
}

export function createSampleInvoice(): InvoiceData {
  return {
    style: 'modern',
    invoiceNumber: 'INV-2026-0042',
    status: 'UNPAID',
    issueDate: todayIso(),
    dueDate: plusDaysIso(14),
    currency: 'USD',
    fromName: 'Studio Nova Creative',
    fromEmail: 'billing@studionova.io',
    fromPhone: '+880 1711-000123',
    fromAddress: 'House 24, Road 11, Banani\nDhaka 1213, Bangladesh',
    toName: 'Sarah Jenkins',
    toCompany: 'Acme Digital Labs',
    toEmail: 'accounts@acmedigital.com',
    toAddress: '450 Mission Street, Suite 300\nSan Francisco, CA 94105',
    items: [
      { id: '1', description: 'UI/UX Design System & Interactive Prototype', quantity: 1, rate: 1200 },
      { id: '2', description: 'Frontend React + TypeScript Implementation (Hours)', quantity: 24, rate: 45 },
      { id: '3', description: 'Performance Optimization & QA Testing', quantity: 1, rate: 350 },
    ],
    discountType: 'percent',
    discountValue: 5,
    taxRate: 10,
    shipping: 0,
    notes: 'Thank you for your business! Please include the invoice number on your bank transfer.',
    paymentTerms: 'Bank Transfer / Wise / Payoneer · Due within 14 days',
    signerName: 'Sohag Rahman',
  }
}

export function createSampleResume(): ResumeData {
  return {
    style: 'modern',
    fullName: 'Arafat Hossain',
    headline: 'Senior Full-Stack Software Engineer',
    email: 'arafat.hossain@example.com',
    phone: '+880 1700-123456',
    location: 'Dhaka, Bangladesh (Remote)',
    website: 'github.com/arafat-dev · linkedin.com/in/arafat',
    summary:
      'Product-focused Full-Stack Engineer with 6+ years of experience building high-performance web applications, local-first tools, and scalable cloud APIs. Passionate about clean architecture, delightful UI/UX, and mentoring engineering teams.',
    skills: 'TypeScript, React, Next.js, Node.js, PostgreSQL, Tailwind CSS, GraphQL, Docker, AWS, System Design',
    languages: 'English (Fluent), Bengali (Native)',
    experience: [
      {
        id: 'exp-1',
        role: 'Lead Frontend Engineer',
        company: 'PaperFlow Labs',
        location: 'Remote',
        period: '2023 – Present',
        bullets:
          'Architected a browser-local PDF & AI productivity suite serving 50,000+ monthly active users.\nReduced initial bundle load time by 48% through route-level code splitting and Web Workers.\nLed a team of 4 engineers to ship real-time document editing, OCR, and comparison tools.',
      },
      {
        id: 'exp-2',
        role: 'Full-Stack Developer',
        company: 'CloudScale Technologies',
        location: 'Dhaka, BD',
        period: '2020 – 2023',
        bullets:
          'Built multi-tenant SaaS billing and analytics dashboards using React, Node.js, and PostgreSQL.\nDesigned automated CI/CD pipelines cutting release cycles from 2 weeks to daily deployments.\nImproved API p95 response latency from 420ms to 85ms via query tuning and Redis caching.',
      },
    ],
    education: [
      {
        id: 'edu-1',
        degree: 'B.Sc. in Computer Science & Engineering',
        school: 'Bangladesh University of Engineering & Technology (BUET)',
        period: '2016 – 2020',
        details: 'CGPA: 3.82 / 4.00 · Dean’s List Honors',
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'PaperFlow AI Open-Source',
        link: 'github.com/paperflow-ai',
        description: 'Privacy-first in-browser PDF editor, OCR, and local AI assistant built with React 19 & WebAssembly.',
      },
    ],
  }
}

export function createSampleCertificate(): CertificateData {
  return {
    style: 'classic-gold',
    organization: 'PAPERFLOW ACADEMY',
    title: 'CERTIFICATE OF ACHIEVEMENT',
    subtitle: 'THIS CERTIFICATE IS PROUDLY PRESENTED TO',
    recipientName: 'Nadia Rahman',
    description:
      'In recognition of outstanding dedication, creativity, and successful completion of all hands-on projects and assessments in',
    courseOrEvent: 'Full-Stack Web Engineering & Modern UI Architecture',
    issueDate: todayIso(),
    certificateId: 'PF-CERT-2026-8841',
    signer1Name: 'Dr. Mahmudul Hasan',
    signer1Title: 'Program Director',
    signer2Name: 'Tanvir Ahmed',
    signer2Title: 'Lead Instructor',
  }
}

export function createSampleLetterhead(): LetterheadData {
  return {
    style: 'corporate',
    companyName: 'Apex Horizon Solutions Ltd.',
    tagline: 'Enterprise Software & Digital Transformation',
    companyAddress: 'Level 9, Green Tower, Gulshan-2, Dhaka 1212, Bangladesh',
    companyContact: 'info@apexhorizon.com  |  +880 2-9881234  |  www.apexhorizon.com',
    referenceNo: 'REF/AHS/2026/019',
    date: todayIso(),
    recipientName: 'Mr. Tariqul Islam',
    recipientTitle: 'Head of Procurement',
    recipientOrg: 'Metro Finance Corporation',
    recipientAddress: 'Motijheel Commercial Area, Dhaka 1000',
    subject: 'Proposal for Annual Enterprise Document Automation Suite',
    salutation: 'Dear Mr. Islam,',
    body:
      'We are pleased to submit our formal proposal for implementing our privacy-first Document Automation Suite across Metro Finance Corporation.\n\nFollowing our discovery session last week, our engineering team has tailored a deployment plan that eliminates cloud data exposure while accelerating your daily PDF processing, invoicing, and verification workflows by over 60%.\n\nEnclosed with this letter are the technical architecture overview, phased rollout timeline, and transparent licensing schedule. We would welcome the opportunity to walk your leadership team through a live demonstration next Tuesday.\n\nThank you for your time and consideration. Please feel free to reach out directly with any questions.',
    closing: 'Sincerely,',
    senderName: 'Farhana Karim',
    senderTitle: 'Managing Director, Apex Horizon Solutions Ltd.',
  }
}

/* ───────────────────────── PDF Helpers ───────────────────────── */

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (full.length !== 6) return [0.31, 0.27, 0.9]
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return [Number.isFinite(r) ? r : 0.31, Number.isFinite(g) ? g : 0.27, Number.isFinite(b) ? b : 0.9]
}

function rgbFromHex(hex: string) {
  const [r, g, b] = hexToRgbTuple(hex)
  return rgb(r, g, b)
}

function tintHex(hex: string, mix = 0.9) {
  const [r, g, b] = hexToRgbTuple(hex)
  return rgb(r + (1 - r) * mix, g + (1 - g) * mix, b + (1 - b) * mix)
}

function safePdfText(text: string): string {
  return text
    .replace(/[•●]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/·/g, '|')
    .replace(/৳/g, 'BDT ')
    .replace(/₹/g, 'INR ')
    .replace(/€/g, 'EUR ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '')
}

async function loadFontPair(doc: PDFDocument, font: TemplateFont) {
  if (font === 'serif') {
    return {
      regular: await doc.embedFont(StandardFonts.TimesRoman),
      bold: await doc.embedFont(StandardFonts.TimesRomanBold),
      italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    }
  }
  if (font === 'mono') {
    return {
      regular: await doc.embedFont(StandardFonts.Courier),
      bold: await doc.embedFont(StandardFonts.CourierBold),
      italic: await doc.embedFont(StandardFonts.CourierOblique),
    }
  }
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  }
}

async function embedDataUrlImage(doc: PDFDocument, dataUrl?: string): Promise<PDFImage | null> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
  try {
    const res = await fetch(dataUrl)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (dataUrl.includes('image/png')) return await doc.embedPng(bytes)
    return await doc.embedJpg(bytes)
  } catch {
    return null
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = safePdfText(text)
  const paragraphs = safe.split(/\r?\n/)
  const lines: string[] = []
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    const words = para.split(/\s+/)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function drawRightAligned(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const safe = safePdfText(text)
  const w = font.widthOfTextAtSize(safe, size)
  page.drawText(safe, { x: rightX - w, y, size, font, color })
}

function drawCentered(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const safe = safePdfText(text)
  const w = font.widthOfTextAtSize(safe, size)
  page.drawText(safe, { x: centerX - w / 2, y, size, font, color })
}

/* ───────────────────────── 1. INVOICE PDF ───────────────────────── */

export async function generateInvoicePdf(data: InvoiceData, theme: TemplateTheme): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 Portrait
  const { width, height } = page.getSize()
  const fonts = await loadFontPair(doc, theme.font)
  const accent = rgbFromHex(theme.accentColor)
  const accentSoft = tintHex(theme.accentColor, 0.92)
  const ink = rgb(0.11, 0.14, 0.2)
  const muted = rgb(0.42, 0.46, 0.54)
  const border = rgb(0.87, 0.89, 0.92)
  const s = theme.fontScale
  const m = 44

  const logoImg = await embedDataUrlImage(doc, theme.logoDataUrl)
  const sigImg = await embedDataUrlImage(doc, theme.signatureDataUrl)

  let y = height - m

  // Header styling
  if (data.style === 'modern') {
    page.drawRectangle({ x: 0, y: height - 118, width, height: 118, color: accent })
    let leftX = m
    if (logoImg) {
      const dims = logoImg.scaleToFit(56, 56)
      page.drawImage(logoImg, { x: leftX, y: height - 86, width: dims.width, height: dims.height })
      leftX += dims.width + 14
    }
    page.drawText(safePdfText(data.fromName || 'Your Business'), {
      x: leftX,
      y: height - 56,
      size: 18 * s,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    })
    const fromSub = [data.fromEmail, data.fromPhone].filter(Boolean).join('  |  ')
    if (fromSub) {
      page.drawText(safePdfText(fromSub), {
        x: leftX,
        y: height - 74,
        size: 9 * s,
        font: fonts.regular,
        color: rgb(0.92, 0.94, 0.98),
      })
    }
    drawRightAligned(page, 'INVOICE', width - m, height - 56, fonts.bold, 24 * s, rgb(1, 1, 1))
    drawRightAligned(page, `#${data.invoiceNumber}`, width - m, height - 76, fonts.regular, 10.5 * s, rgb(0.92, 0.94, 0.98))
    drawRightAligned(page, `STATUS: ${data.status}`, width - m, height - 94, fonts.bold, 8.5 * s, rgb(1, 1, 1))
    y = height - 146
  } else {
    if (data.style === 'classic') {
      page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent })
    }
    let leftX = m
    if (logoImg) {
      const dims = logoImg.scaleToFit(48, 48)
      page.drawImage(logoImg, { x: leftX, y: y - 34, width: dims.width, height: dims.height })
      leftX += dims.width + 12
    }
    page.drawText(safePdfText(data.fromName || 'Your Business'), {
      x: leftX,
      y: y - 10,
      size: 17 * s,
      font: fonts.bold,
      color: ink,
    })
    const fromSub = [data.fromEmail, data.fromPhone].filter(Boolean).join('  |  ')
    if (fromSub) {
      page.drawText(safePdfText(fromSub), { x: leftX, y: y - 26, size: 9 * s, font: fonts.regular, color: muted })
    }
    drawRightAligned(page, 'INVOICE', width - m, y - 10, fonts.bold, 22 * s, accent)
    drawRightAligned(page, `#${data.invoiceNumber}  |  ${data.status}`, width - m, y - 28, fonts.bold, 9 * s, muted)
    y -= 52
    page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 1, color: border })
    y -= 24
  }

  // From / Bill To / Dates Row
  const colW = (width - m * 2) / 3
  const blockTop = y

  // Bill To
  page.drawText('BILL TO', { x: m, y: blockTop, size: 8 * s, font: fonts.bold, color: accent })
  let ty = blockTop - 14
  if (data.toName) {
    page.drawText(safePdfText(data.toName), { x: m, y: ty, size: 10.5 * s, font: fonts.bold, color: ink })
    ty -= 13
  }
  if (data.toCompany) {
    page.drawText(safePdfText(data.toCompany), { x: m, y: ty, size: 9.5 * s, font: fonts.regular, color: ink })
    ty -= 12
  }
  if (data.toEmail) {
    page.drawText(safePdfText(data.toEmail), { x: m, y: ty, size: 8.5 * s, font: fonts.regular, color: muted })
    ty -= 12
  }
  for (const line of wrapText(data.toAddress, fonts.regular, 8.5 * s, colW + 25)) {
    page.drawText(line, { x: m, y: ty, size: 8.5 * s, font: fonts.regular, color: muted })
    ty -= 11.5
  }

  // From Address (middle)
  const midX = m + colW + 16
  page.drawText('FROM', { x: midX, y: blockTop, size: 8 * s, font: fonts.bold, color: accent })
  let fy = blockTop - 14
  for (const line of wrapText(data.fromAddress, fonts.regular, 8.5 * s, colW)) {
    page.drawText(line, { x: midX, y: fy, size: 8.5 * s, font: fonts.regular, color: muted })
    fy -= 11.5
  }

  // Dates (right)
  drawRightAligned(page, 'ISSUE DATE', width - m, blockTop, fonts.bold, 8 * s, accent)
  drawRightAligned(page, data.issueDate || '-', width - m, blockTop - 14, fonts.regular, 9.5 * s, ink)
  drawRightAligned(page, 'DUE DATE', width - m, blockTop - 34, fonts.bold, 8 * s, accent)
  drawRightAligned(page, data.dueDate || '-', width - m, blockTop - 48, fonts.bold, 9.5 * s, ink)

  y = Math.min(ty, fy, blockTop - 62) - 22

  // Line Items Table Header
  const tableW = width - m * 2
  const headerH = 26
  page.drawRectangle({
    x: m,
    y: y - headerH + 6,
    width: tableW,
    height: headerH,
    color: data.style === 'minimal' ? rgb(0.95, 0.96, 0.98) : accentSoft,
  })
  const colDescX = m + 10
  const colQtyRight = m + tableW * 0.62
  const colRateRight = m + tableW * 0.8
  const colAmtRight = width - m - 10

  page.drawText('DESCRIPTION', { x: colDescX, y: y - 10, size: 8.5 * s, font: fonts.bold, color: accent })
  drawRightAligned(page, 'QTY', colQtyRight, y - 10, fonts.bold, 8.5 * s, accent)
  drawRightAligned(page, 'RATE', colRateRight, y - 10, fonts.bold, 8.5 * s, accent)
  drawRightAligned(page, 'AMOUNT', colAmtRight, y - 10, fonts.bold, 8.5 * s, accent)
  y -= headerH + 6

  // Items rows
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i]
    const descLines = wrapText(it.description || 'Item', fonts.regular, 9.5 * s, tableW * 0.52)
    const rowH = Math.max(24, descLines.length * 13 + 10)
    if (y - rowH < 155) break

    if (i % 2 === 1 && data.style !== 'minimal') {
      page.drawRectangle({ x: m, y: y - rowH + 8, width: tableW, height: rowH, color: rgb(0.98, 0.985, 0.995) })
    }
    let dy = y - 8
    for (const dl of descLines) {
      page.drawText(dl, { x: colDescX, y: dy, size: 9.5 * s, font: fonts.regular, color: ink })
      dy -= 13
    }
    const lineTotal = Math.max(0, it.quantity) * Math.max(0, it.rate)
    drawRightAligned(page, String(it.quantity), colQtyRight, y - 8, fonts.regular, 9.5 * s, ink)
    drawRightAligned(page, formatMoney(it.rate, data.currency, true), colRateRight, y - 8, fonts.regular, 9.5 * s, muted)
    drawRightAligned(page, formatMoney(lineTotal, data.currency, true), colAmtRight, y - 8, fonts.bold, 9.5 * s, ink)

    y -= rowH
    page.drawLine({ start: { x: m, y: y + 6 }, end: { x: width - m, y: y + 6 }, thickness: 0.5, color: border })
  }

  y -= 16

  // Totals Summary Box (right) + Notes (left)
  const totals = computeInvoiceTotals(data)
  const sumW = 215
  const sumX = width - m - sumW
  let sy = y

  const drawTotalRow = (label: string, val: string, bold = false) => {
    page.drawText(label, { x: sumX + 8, y: sy, size: 9.5 * s, font: bold ? fonts.bold : fonts.regular, color: muted })
    drawRightAligned(page, val, width - m - 8, sy, bold ? fonts.bold : fonts.regular, 9.5 * s, ink)
    sy -= 17
  }

  drawTotalRow('Subtotal', formatMoney(totals.subtotal, data.currency, true))
  if (totals.discountAmount > 0) {
    const label = data.discountType === 'percent' ? `Discount (${data.discountValue}%)` : 'Discount'
    drawTotalRow(label, `-${formatMoney(totals.discountAmount, data.currency, true)}`)
  }
  if (totals.taxAmount > 0) {
    drawTotalRow(`Tax (${data.taxRate}%)`, formatMoney(totals.taxAmount, data.currency, true))
  }
  if (totals.shipping > 0) {
    drawTotalRow('Shipping', formatMoney(totals.shipping, data.currency, true))
  }

  sy -= 4
  page.drawRectangle({ x: sumX, y: sy - 10, width: sumW, height: 28, color: accent })
  page.drawText('TOTAL DUE', { x: sumX + 10, y: sy, size: 10 * s, font: fonts.bold, color: rgb(1, 1, 1) })
  drawRightAligned(
    page,
    formatMoney(totals.grandTotal, data.currency, true),
    width - m - 10,
    sy,
    fonts.bold,
    12 * s,
    rgb(1, 1, 1),
  )

  // Notes & Payment Terms on left
  let ny = y
  const notesW = width - m * 2 - sumW - 24
  if (data.paymentTerms) {
    page.drawText('PAYMENT TERMS', { x: m, y: ny, size: 8 * s, font: fonts.bold, color: accent })
    ny -= 13
    for (const ln of wrapText(data.paymentTerms, fonts.regular, 8.5 * s, notesW)) {
      page.drawText(ln, { x: m, y: ny, size: 8.5 * s, font: fonts.regular, color: ink })
      ny -= 12
    }
    ny -= 8
  }
  if (data.notes) {
    page.drawText('NOTES', { x: m, y: ny, size: 8 * s, font: fonts.bold, color: accent })
    ny -= 13
    for (const ln of wrapText(data.notes, fonts.regular, 8.5 * s, notesW)) {
      page.drawText(ln, { x: m, y: ny, size: 8.5 * s, font: fonts.regular, color: muted })
      ny -= 12
    }
  }

  // Optional Signature at bottom right
  if (sigImg || data.signerName) {
    const sigBaseY = 64
    if (sigImg) {
      const dims = sigImg.scaleToFit(120, 40)
      page.drawImage(sigImg, { x: width - m - dims.width, y: sigBaseY + 14, width: dims.width, height: dims.height })
    }
    page.drawLine({ start: { x: width - m - 140, y: sigBaseY + 10 }, end: { x: width - m, y: sigBaseY + 10 }, thickness: 0.8, color: border })
    drawRightAligned(page, data.signerName || 'Authorized Signature', width - m, sigBaseY - 2, fonts.regular, 8.5 * s, muted)
  }

  // Subtle footer
  page.drawText(safePdfText(`${data.fromName}  |  Invoice #${data.invoiceNumber}`), {
    x: m,
    y: 28,
    size: 7.5,
    font: fonts.regular,
    color: rgb(0.6, 0.63, 0.69),
  })

  return savePdf(doc)
}

/* ───────────────────────── 2. RESUME / CV PDF ───────────────────────── */

export async function generateResumePdf(data: ResumeData, theme: TemplateTheme): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const fonts = await loadFontPair(doc, theme.font)
  const accent = rgbFromHex(theme.accentColor)
  const accentSoft = tintHex(theme.accentColor, 0.93)
  const ink = rgb(0.11, 0.14, 0.2)
  const muted = rgb(0.4, 0.44, 0.52)
  const border = rgb(0.86, 0.88, 0.92)
  const s = theme.fontScale
  const m = 40

  const skillsList = data.skills
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  if (data.style === 'modern') {
    // Modern Two-Column Layout (Left sidebar + Right main)
    const sideW = 178
    page.drawRectangle({ x: 0, y: 0, width: sideW, height, color: accentSoft })
    page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent })

    // Left sidebar content
    let sy = height - 48
    const sx = 22
    const sw = sideW - 36

    const nameLines = wrapText(data.fullName || 'Your Name', fonts.bold, 17 * s, sw)
    for (const ln of nameLines) {
      page.drawText(ln, { x: sx, y: sy, size: 17 * s, font: fonts.bold, color: ink })
      sy -= 20 * s
    }
    const headLines = wrapText(data.headline, fonts.bold, 9.5 * s, sw)
    for (const ln of headLines) {
      page.drawText(ln, { x: sx, y: sy, size: 9.5 * s, font: fonts.bold, color: accent })
      sy -= 13 * s
    }
    sy -= 14

    const drawSideHeading = (title: string) => {
      page.drawText(title, { x: sx, y: sy, size: 8.5 * s, font: fonts.bold, color: accent })
      sy -= 4
      page.drawLine({ start: { x: sx, y: sy }, end: { x: sx + sw, y: sy }, thickness: 0.7, color: border })
      sy -= 13
    }

    drawSideHeading('CONTACT')
    for (const item of [data.email, data.phone, data.location, data.website].filter(Boolean)) {
      for (const ln of wrapText(item, fonts.regular, 8.2 * s, sw)) {
        page.drawText(ln, { x: sx, y: sy, size: 8.2 * s, font: fonts.regular, color: ink })
        sy -= 11.5 * s
      }
      sy -= 3
    }

    if (skillsList.length > 0) {
      sy -= 10
      drawSideHeading('SKILLS')
      for (const sk of skillsList.slice(0, 18)) {
        page.drawText(safePdfText(`- ${sk}`), { x: sx, y: sy, size: 8.5 * s, font: fonts.regular, color: ink })
        sy -= 12.5 * s
      }
    }

    if (data.languages.trim()) {
      sy -= 10
      drawSideHeading('LANGUAGES')
      for (const ln of wrapText(data.languages, fonts.regular, 8.5 * s, sw)) {
        page.drawText(ln, { x: sx, y: sy, size: 8.5 * s, font: fonts.regular, color: ink })
        sy -= 12 * s
      }
    }

    // Right Main Column
    const mx = sideW + 28
    const mw = width - mx - 32
    let my = height - 48

    const drawMainHeading = (title: string) => {
      page.drawText(title, { x: mx, y: my, size: 10 * s, font: fonts.bold, color: accent })
      my -= 5
      page.drawLine({ start: { x: mx, y: my }, end: { x: mx + mw, y: my }, thickness: 1, color: border })
      my -= 14
    }

    if (data.summary.trim()) {
      drawMainHeading('PROFILE SUMMARY')
      for (const ln of wrapText(data.summary, fonts.regular, 9 * s, mw)) {
        page.drawText(ln, { x: mx, y: my, size: 9 * s, font: fonts.regular, color: ink })
        my -= 12.5 * s
      }
      my -= 12
    }

    if (data.experience.length > 0) {
      drawMainHeading('EXPERIENCE')
      for (const exp of data.experience) {
        if (my < 90) break
        page.drawText(safePdfText(exp.role), { x: mx, y: my, size: 10.5 * s, font: fonts.bold, color: ink })
        drawRightAligned(page, exp.period, mx + mw, my, fonts.regular, 8.5 * s, muted)
        my -= 13 * s
        page.drawText(safePdfText([exp.company, exp.location].filter(Boolean).join(' | ')), {
          x: mx,
          y: my,
          size: 9 * s,
          font: fonts.italic,
          color: accent,
        })
        my -= 13 * s
        const bullets = exp.bullets
          .split(/\r?\n/)
          .map((b) => b.trim())
          .filter(Boolean)
        for (const b of bullets) {
          const bLines = wrapText(`- ${b}`, fonts.regular, 8.6 * s, mw - 6)
          for (const bl of bLines) {
            if (my < 60) break
            page.drawText(bl, { x: mx + 4, y: my, size: 8.6 * s, font: fonts.regular, color: ink })
            my -= 11.8 * s
          }
        }
        my -= 9
      }
    }

    if (data.education.length > 0 && my > 95) {
      drawMainHeading('EDUCATION')
      for (const edu of data.education) {
        page.drawText(safePdfText(edu.degree), { x: mx, y: my, size: 9.8 * s, font: fonts.bold, color: ink })
        drawRightAligned(page, edu.period, mx + mw, my, fonts.regular, 8.5 * s, muted)
        my -= 12.5 * s
        page.drawText(safePdfText(edu.school), { x: mx, y: my, size: 8.8 * s, font: fonts.regular, color: muted })
        my -= 11.5 * s
        if (edu.details) {
          page.drawText(safePdfText(edu.details), { x: mx, y: my, size: 8.3 * s, font: fonts.italic, color: muted })
          my -= 11.5 * s
        }
        my -= 6
      }
    }

    if (data.projects.length > 0 && my > 75) {
      drawMainHeading('PROJECTS & CERTIFICATIONS')
      for (const pr of data.projects) {
        page.drawText(safePdfText(pr.name), { x: mx, y: my, size: 9.5 * s, font: fonts.bold, color: ink })
        if (pr.link) drawRightAligned(page, pr.link, mx + mw, my, fonts.regular, 8 * s, accent)
        my -= 12 * s
        for (const ln of wrapText(pr.description, fonts.regular, 8.5 * s, mw)) {
          if (my < 36) break
          page.drawText(ln, { x: mx, y: my, size: 8.5 * s, font: fonts.regular, color: muted })
          my -= 11.5 * s
        }
        my -= 6
      }
    }
  } else {
    // Executive / Classic ATS Single-Column Layout
    const cw = width - m * 2
    let y = height - m

    if (data.style === 'executive') {
      page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: accent })
      page.drawText(safePdfText(data.fullName || 'Your Name'), {
        x: m,
        y: height - 46,
        size: 22 * s,
        font: fonts.bold,
        color: rgb(1, 1, 1),
      })
      page.drawText(safePdfText(data.headline), {
        x: m,
        y: height - 66,
        size: 11 * s,
        font: fonts.regular,
        color: rgb(0.92, 0.94, 1),
      })
      const contactLine = [data.email, data.phone, data.location, data.website].filter(Boolean).join('  |  ')
      page.drawText(safePdfText(contactLine), {
        x: m,
        y: height - 83,
        size: 8.2 * s,
        font: fonts.regular,
        color: rgb(0.9, 0.93, 1),
      })
      y = height - 120
    } else {
      drawCentered(page, data.fullName || 'Your Name', width / 2, y - 6, fonts.bold, 21 * s, ink)
      y -= 24 * s
      drawCentered(page, data.headline, width / 2, y, fonts.bold, 10.5 * s, accent)
      y -= 15 * s
      const contactLine = [data.email, data.phone, data.location].filter(Boolean).join('  |  ')
      drawCentered(page, contactLine, width / 2, y, fonts.regular, 8.5 * s, muted)
      y -= 14
      page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 1.2, color: accent })
      y -= 20
    }

    const drawSec = (title: string) => {
      page.drawText(title, { x: m, y, size: 10 * s, font: fonts.bold, color: accent })
      y -= 5
      page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.7, color: border })
      y -= 14
    }

    if (data.summary.trim()) {
      drawSec('PROFESSIONAL SUMMARY')
      for (const ln of wrapText(data.summary, fonts.regular, 9.2 * s, cw)) {
        page.drawText(ln, { x: m, y, size: 9.2 * s, font: fonts.regular, color: ink })
        y -= 13 * s
      }
      y -= 10
    }

    if (data.experience.length > 0) {
      drawSec('EXPERIENCE')
      for (const exp of data.experience) {
        if (y < 95) break
        page.drawText(safePdfText(`${exp.role} — ${exp.company}`), { x: m, y, size: 10.2 * s, font: fonts.bold, color: ink })
        drawRightAligned(page, `${exp.period}${exp.location ? ` | ${exp.location}` : ''}`, width - m, y, fonts.regular, 8.5 * s, muted)
        y -= 13.5 * s
        for (const b of exp.bullets.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
          for (const bl of wrapText(`- ${b}`, fonts.regular, 8.8 * s, cw - 8)) {
            if (y < 55) break
            page.drawText(bl, { x: m + 6, y, size: 8.8 * s, font: fonts.regular, color: ink })
            y -= 12.2 * s
          }
        }
        y -= 8
      }
    }

    if (data.education.length > 0 && y > 90) {
      drawSec('EDUCATION')
      for (const edu of data.education) {
        page.drawText(safePdfText(`${edu.degree} — ${edu.school}`), { x: m, y, size: 9.8 * s, font: fonts.bold, color: ink })
        drawRightAligned(page, edu.period, width - m, y, fonts.regular, 8.5 * s, muted)
        y -= 13 * s
        if (edu.details) {
          page.drawText(safePdfText(edu.details), { x: m, y, size: 8.5 * s, font: fonts.italic, color: muted })
          y -= 12 * s
        }
        y -= 5
      }
    }

    if (skillsList.length > 0 && y > 65) {
      drawSec('SKILLS & LANGUAGES')
      for (const ln of wrapText(skillsList.join('  |  '), fonts.regular, 8.8 * s, cw)) {
        page.drawText(ln, { x: m, y, size: 8.8 * s, font: fonts.regular, color: ink })
        y -= 12.5 * s
      }
      if (data.languages.trim()) {
        page.drawText(safePdfText(`Languages: ${data.languages}`), { x: m, y, size: 8.6 * s, font: fonts.italic, color: muted })
      }
    }
  }

  return savePdf(doc)
}

/* ───────────────────────── 3. CERTIFICATE PDF ───────────────────────── */

export async function generateCertificatePdf(data: CertificateData, theme: TemplateTheme): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const page = doc.addPage([841.89, 595.28]) // A4 Landscape
  const { width, height } = page.getSize()
  const fonts = await loadFontPair(doc, theme.font === 'sans' && data.style === 'classic-gold' ? 'serif' : theme.font)
  const accent = rgbFromHex(theme.accentColor)
  const accentSoft = tintHex(theme.accentColor, 0.93)
  const gold = rgb(0.76, 0.58, 0.2)
  const ink = rgb(0.11, 0.14, 0.2)
  const muted = rgb(0.4, 0.44, 0.52)
  const s = theme.fontScale

  const logoImg = await embedDataUrlImage(doc, theme.logoDataUrl)
  const sigImg = await embedDataUrlImage(doc, theme.signatureDataUrl)

  // Background & Decorative Framing
  if (data.style === 'classic-gold') {
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.996, 0.992, 0.978) })
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: gold, borderWidth: 3.5 })
    page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: accent, borderWidth: 1 })
    // Corner diamonds
    for (const [cx, cy] of [
      [34, 34],
      [width - 34, 34],
      [34, height - 34],
      [width - 34, height - 34],
    ]) {
      page.drawCircle({ x: cx, y: cy, size: 5, color: gold })
    }
  } else if (data.style === 'modern-indigo') {
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
    page.drawRectangle({ x: 0, y: 0, width: 22, height, color: accent })
    page.drawRectangle({ x: 22, y: 0, width: 8, height, color: accentSoft })
    page.drawRectangle({ x: 42, y: 28, width: width - 70, height: height - 56, borderColor: rgb(0.88, 0.9, 0.94), borderWidth: 1 })
  } else {
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.995, 0.99) })
    page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: accent, borderWidth: 4 })
    page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: gold, borderWidth: 1.2 })
    page.drawRectangle({ x: 32, y: height - 96, width: width - 64, height: 64, color: accentSoft })
  }

  const cx = width / 2
  let y = height - 74

  if (logoImg) {
    const dims = logoImg.scaleToFit(54, 54)
    page.drawImage(logoImg, { x: cx - dims.width / 2, y: y - 16, width: dims.width, height: dims.height })
    y -= 36
  }

  drawCentered(page, data.organization.toUpperCase(), cx, y, fonts.bold, 11 * s, accent)
  y -= 42

  drawCentered(page, data.title || 'CERTIFICATE OF ACHIEVEMENT', cx, y, fonts.bold, 30 * s, ink)
  y -= 28

  drawCentered(page, data.subtitle || 'THIS CERTIFICATE IS PROUDLY PRESENTED TO', cx, y, fonts.regular, 10 * s, muted)
  y -= 52

  drawCentered(page, data.recipientName || 'Recipient Name', cx, y, fonts.italic, 36 * s, accent)
  y -= 14
  page.drawLine({ start: { x: cx - 180, y }, end: { x: cx + 180, y }, thickness: 1.2, color: gold })
  y -= 28

  for (const ln of wrapText(data.description, fonts.regular, 11.5 * s, 560)) {
    drawCentered(page, ln, cx, y, fonts.regular, 11.5 * s, muted)
    y -= 17 * s
  }
  y -= 10

  drawCentered(page, data.courseOrEvent, cx, y, fonts.bold, 16 * s, ink)

  // Bottom Signatories + Seal
  const sigY = 98
  const leftSigX = 185
  const rightSigX = width - 185

  if (sigImg) {
    const dims = sigImg.scaleToFit(110, 38)
    page.drawImage(sigImg, { x: leftSigX - dims.width / 2, y: sigY + 14, width: dims.width, height: dims.height })
  }

  // Left Signer
  page.drawLine({ start: { x: leftSigX - 90, y: sigY + 10 }, end: { x: leftSigX + 90, y: sigY + 10 }, thickness: 0.9, color: muted })
  drawCentered(page, data.signer1Name, leftSigX, sigY - 6, fonts.bold, 10.5 * s, ink)
  drawCentered(page, data.signer1Title, leftSigX, sigY - 20, fonts.regular, 8.5 * s, muted)

  // Center Seal / Badge
  page.drawCircle({ x: cx, y: sigY + 4, size: 30, color: accentSoft, borderColor: gold, borderWidth: 2 })
  page.drawCircle({ x: cx, y: sigY + 4, size: 23, borderColor: accent, borderWidth: 0.8 })
  drawCentered(page, 'VERIFIED', cx, sigY + 1, fonts.bold, 7.5, accent)

  // Right Signer
  page.drawLine({ start: { x: rightSigX - 90, y: sigY + 10 }, end: { x: rightSigX + 90, y: sigY + 10 }, thickness: 0.9, color: muted })
  drawCentered(page, data.signer2Name, rightSigX, sigY - 6, fonts.bold, 10.5 * s, ink)
  drawCentered(page, data.signer2Title, rightSigX, sigY - 20, fonts.regular, 8.5 * s, muted)

  // Metadata footer
  page.drawText(safePdfText(`Date Issued: ${data.issueDate}`), { x: 54, y: 44, size: 8.5, font: fonts.regular, color: muted })
  drawRightAligned(page, `Certificate ID: ${data.certificateId}`, width - 54, 44, fonts.regular, 8.5, muted)

  return savePdf(doc)
}

/* ───────────────────────── 4. OFFICIAL LETTERHEAD PDF ───────────────────────── */

export async function generateLetterheadPdf(data: LetterheadData, theme: TemplateTheme): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const fonts = await loadFontPair(doc, theme.font)
  const accent = rgbFromHex(theme.accentColor)
  const ink = rgb(0.11, 0.14, 0.2)
  const muted = rgb(0.42, 0.46, 0.54)
  const border = rgb(0.86, 0.88, 0.92)
  const s = theme.fontScale
  const m = 52

  const logoImg = await embedDataUrlImage(doc, theme.logoDataUrl)
  const sigImg = await embedDataUrlImage(doc, theme.signatureDataUrl)

  let y = height - 46

  if (data.style === 'corporate') {
    page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: accent })
    let lx = m
    if (logoImg) {
      const dims = logoImg.scaleToFit(46, 46)
      page.drawImage(logoImg, { x: lx, y: y - 34, width: dims.width, height: dims.height })
      lx += dims.width + 14
    }
    page.drawText(safePdfText(data.companyName), { x: lx, y: y - 10, size: 17 * s, font: fonts.bold, color: accent })
    if (data.tagline) {
      page.drawText(safePdfText(data.tagline), { x: lx, y: y - 25, size: 9 * s, font: fonts.italic, color: muted })
    }
    y -= 50
    page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 1.5, color: accent })
    y -= 26
  } else if (data.style === 'editorial') {
    if (logoImg) {
      const dims = logoImg.scaleToFit(42, 42)
      page.drawImage(logoImg, { x: width / 2 - dims.width / 2, y: y - 28, width: dims.width, height: dims.height })
      y -= 42
    }
    drawCentered(page, data.companyName.toUpperCase(), width / 2, y, fonts.bold, 16 * s, ink)
    y -= 15
    if (data.tagline) {
      drawCentered(page, data.tagline, width / 2, y, fonts.italic, 9 * s, accent)
      y -= 14
    }
    drawCentered(page, data.companyContact, width / 2, y, fonts.regular, 8 * s, muted)
    y -= 12
    page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.9, color: border })
    y -= 26
  } else {
    page.drawText(safePdfText(data.companyName), { x: m, y: y - 8, size: 15 * s, font: fonts.bold, color: ink })
    drawRightAligned(page, data.date, width - m, y - 8, fonts.regular, 9.5 * s, muted)
    y -= 22
    page.drawText(safePdfText(data.companyAddress), { x: m, y, size: 8.5 * s, font: fonts.regular, color: muted })
    y -= 16
    page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.7, color: border })
    y -= 24
  }

  // Reference & Date row
  if (data.referenceNo) {
    page.drawText(safePdfText(`Ref: ${data.referenceNo}`), { x: m, y, size: 9 * s, font: fonts.bold, color: muted })
  }
  if (data.style !== 'minimal') {
    drawRightAligned(page, `Date: ${data.date}`, width - m, y, fonts.regular, 9.5 * s, ink)
  }
  y -= 26

  // Recipient Block
  for (const line of [data.recipientName, data.recipientTitle, data.recipientOrg, ...data.recipientAddress.split(/\r?\n/)].filter(Boolean)) {
    page.drawText(safePdfText(line), {
      x: m,
      y,
      size: 9.5 * s,
      font: line === data.recipientName ? fonts.bold : fonts.regular,
      color: line === data.recipientName ? ink : muted,
    })
    y -= 13.5 * s
  }
  y -= 14

  // Subject
  if (data.subject.trim()) {
    page.drawText(safePdfText(`Subject: ${data.subject}`), {
      x: m,
      y,
      size: 10.5 * s,
      font: fonts.bold,
      color: accent,
    })
    y -= 22
  }

  // Salutation
  if (data.salutation.trim()) {
    page.drawText(safePdfText(data.salutation), { x: m, y, size: 10 * s, font: fonts.regular, color: ink })
    y -= 18
  }

  // Body paragraphs
  const bodyLines = wrapText(data.body, fonts.regular, 10 * s, width - m * 2)
  for (const ln of bodyLines) {
    if (y < 140) break
    if (!ln) {
      y -= 10
    } else {
      page.drawText(ln, { x: m, y, size: 10 * s, font: fonts.regular, color: ink })
      y -= 14.5 * s
    }
  }

  y -= 16
  page.drawText(safePdfText(data.closing || 'Sincerely,'), { x: m, y, size: 10 * s, font: fonts.regular, color: ink })
  y -= 12

  if (sigImg) {
    const dims = sigImg.scaleToFit(120, 42)
    page.drawImage(sigImg, { x: m, y: y - dims.height, width: dims.width, height: dims.height })
    y -= dims.height + 10
  } else {
    y -= 28
  }

  page.drawText(safePdfText(data.senderName), { x: m, y, size: 10.5 * s, font: fonts.bold, color: ink })
  y -= 13.5 * s
  page.drawText(safePdfText(data.senderTitle), { x: m, y, size: 9 * s, font: fonts.regular, color: muted })

  // Footer bar
  page.drawLine({ start: { x: m, y: 46 }, end: { x: width - m, y: 46 }, thickness: 0.7, color: border })
  drawCentered(
    page,
    [data.companyAddress, data.companyContact].filter(Boolean).join('  |  '),
    width / 2,
    30,
    fonts.regular,
    7.8,
    muted,
  )

  return savePdf(doc)
}

/* ───────────────────────── LOCAL PROJECTS & DRAFTS STORE ───────────────────────── */

const PROJECTS_STORAGE_KEY = 'paperflow:templates:projects:v1'

export function deriveProjectSubtitle(project: TemplateProject): string {
  if (project.kind === 'invoice') {
    const totals = computeInvoiceTotals(project.invoice)
    return `${formatMoney(totals.grandTotal, project.invoice.currency)} · ${project.invoice.status}`
  }
  if (project.kind === 'resume') {
    return project.resume.headline || project.resume.email || 'Resume / CV'
  }
  if (project.kind === 'certificate') {
    return project.certificate.courseOrEvent || project.certificate.organization || 'Certificate'
  }
  return project.letterhead.subject || project.letterhead.recipientOrg || 'Official Letterhead'
}

export function deriveDefaultTitle(
  kind: TemplateKind,
  invoice: InvoiceData,
  resume: ResumeData,
  certificate: CertificateData,
  letterhead: LetterheadData,
): string {
  if (kind === 'invoice') {
    const client = invoice.toCompany || invoice.toName
    return client ? `${invoice.invoiceNumber || 'Invoice'} · ${client}` : invoice.invoiceNumber || 'Untitled Invoice'
  }
  if (kind === 'resume') {
    return resume.fullName ? `${resume.fullName} — Resume` : 'Untitled Resume'
  }
  if (kind === 'certificate') {
    return certificate.recipientName ? `${certificate.recipientName} — Certificate` : 'Untitled Certificate'
  }
  return letterhead.companyName ? `${letterhead.companyName} — Letter` : 'Untitled Letterhead'
}

export function createNewTemplateProject(kind: TemplateKind): TemplateProject {
  const now = Date.now()
  const invoice = createSampleInvoice()
  invoice.invoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`
  const resume = createSampleResume()
  const certificate = createSampleCertificate()
  certificate.certificateId = `PF-CERT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`
  const letterhead = createSampleLetterhead()
  return {
    id: `tpl-${now}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title: deriveDefaultTitle(kind, invoice, resume, certificate, letterhead),
    saved: false,
    createdAt: now,
    updatedAt: now,
    theme: createDefaultTheme(),
    invoice,
    resume,
    certificate,
    letterhead,
  }
}

export function listTemplateProjects(): TemplateProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as TemplateProject[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export function upsertTemplateProject(project: TemplateProject): TemplateProject[] {
  const existing = listTemplateProjects()
  const idx = existing.findIndex((p) => p.id === project.id)
  const next = idx >= 0 ? existing.map((p) => (p.id === project.id ? project : p)) : [project, ...existing]
  const sorted = next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(sorted))
  } catch {
    // Ignore storage quota errors
  }
  return sorted
}

export function deleteTemplateProject(id: string): TemplateProject[] {
  const next = listTemplateProjects().filter((p) => p.id !== id)
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors
  }
  return next
}

