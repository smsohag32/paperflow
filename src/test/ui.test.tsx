import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { SmoothSizeSlider } from '@/components/ui/slider'
import DashboardRoute from '@/routes/DashboardRoute'
import CompareRoute from '@/routes/CompareRoute'
import TemplatesRoute from '@/routes/TemplatesRoute'
import MediaRoute from '@/routes/MediaRoute'
import MarkdownRoute from '@/routes/MarkdownRoute'
import { extractPdfImages, applyPdfImageEdits } from '@/lib/pdf/media'
import { loadPdfLib, savePdf } from '@/lib/pdf/pdflib'
import {
  computeInvoiceTotals,
  createDefaultTheme,
  createSampleCertificate,
  createSampleInvoice,
  createSampleLetterhead,
  createSampleResume,
  generateCertificatePdf,
  generateInvoicePdf,
  generateLetterheadPdf,
  generateResumePdf,
} from '@/lib/pdf/templates'

describe('UI components', () => {
  it('renders FileDropzone with browse button', () => {
    const onFiles = vi.fn()
    render(<FileDropzone onFiles={onFiles} title="Upload PDF" />)
    expect(screen.getByText('Upload PDF')).toBeInTheDocument()
    expect(screen.getByText('Browse files')).toBeInTheDocument()
  })

  it('renders Dashboard with tools grid and recent documents', () => {
    render(
      <MemoryRouter>
        <DashboardRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('All Tools')).toBeInTheDocument()
    expect(screen.getAllByText('Merge PDF').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Compression Studio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PDF Compare Studio').length).toBeGreaterThan(0)
    expect(screen.getByText('Recent Documents')).toBeInTheDocument()
  })

  it('renders SmoothSizeSlider with steppers, presets, and reset', () => {
    const onChange = vi.fn()
    render(
      <SmoothSizeSlider
        label="Font size"
        value={24}
        min={8}
        max={72}
        step={2}
        showSteppers
        resetValue={14}
        formatValue={(v) => `${v}pt`}
        presets={[
          { label: '12pt', value: 12 },
          { label: '36pt', value: 36 },
        ]}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Font size')).toBeInTheDocument()
    expect(screen.getByText('24pt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Increase Font size' }))
    expect(onChange).toHaveBeenCalledWith(26)

    fireEvent.click(screen.getByRole('button', { name: '36pt' }))
    expect(onChange).toHaveBeenCalledWith(36)

    fireEvent.click(screen.getByRole('button', { name: 'Reset value' }))
    expect(onChange).toHaveBeenCalledWith(14)
  })

  it('renders CompareRoute upload dropzones', () => {
    render(
      <MemoryRouter>
        <CompareRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('PDF Compare Studio')).toBeInTheDocument()
    expect(screen.getByText('Original PDF (A)')).toBeInTheDocument()
    expect(screen.getByText('Revised PDF (B)')).toBeInTheDocument()
  })

  it('renders Templates Hub, creates new project on box click, and reopens from Recent Projects', () => {
    localStorage.clear()
    render(
      <MemoryRouter>
        <TemplatesRoute />
      </MemoryRouter>,
    )
    // Hub view shows the 4 creation boxes and Recent Projects section
    expect(screen.getByText('Document Templates Studio')).toBeInTheDocument()
    expect(screen.getByText('Create New Document')).toBeInTheDocument()
    expect(screen.getByText('Recent Projects & Drafts')).toBeInTheDocument()

    // Clicking Invoice box opens a fresh Invoice editor
    fireEvent.click(screen.getByRole('button', { name: /Invoice/i }))
    expect(screen.getByText('Live Paper Preview')).toBeInTheDocument()
    expect(screen.getByText('Invoice Details')).toBeInTheDocument()

    // Rename & save the project, then go back to Hub
    const titleInput = screen.getByLabelText('Project title')
    fireEvent.change(titleInput, { target: { value: 'Client Alpha Invoice' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // Recent Projects card should appear in Hub and reopen the exact saved project
    expect(screen.getByText('Client Alpha Invoice')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Client Alpha Invoice'))
    expect(screen.getByDisplayValue('Client Alpha Invoice')).toBeInTheDocument()
  })

  it('calculates invoice totals accurately and generates valid PDFs for all 4 templates', async () => {
    const inv = createSampleInvoice()
    const totals = computeInvoiceTotals(inv)
    // 1*1200 + 24*45 + 1*350 = 2630; 5% discount = 131.5; taxable = 2498.5; 10% tax = 249.85; grand = 2748.35
    expect(totals.subtotal).toBeCloseTo(2630, 2)
    expect(totals.discountAmount).toBeCloseTo(131.5, 2)
    expect(totals.taxAmount).toBeCloseTo(249.85, 2)
    expect(totals.grandTotal).toBeCloseTo(2748.35, 2)

    const theme = createDefaultTheme()
    const [invPdf, resPdf, certPdf, letPdf] = await Promise.all([
      generateInvoicePdf(inv, theme),
      generateResumePdf(createSampleResume(), theme),
      generateCertificatePdf(createSampleCertificate(), theme),
      generateLetterheadPdf(createSampleLetterhead(), theme),
    ])

    for (const bytes of [invPdf, resPdf, certPdf, letPdf]) {
      expect(bytes.byteLength).toBeGreaterThan(800)
      const header = new TextDecoder().decode(bytes.slice(0, 5))
      expect(header).toBe('%PDF-')
    }
  })

  it('renders MediaRoute and extracts/removes embedded PDF images', async () => {
    render(
      <MemoryRouter>
        <MediaRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('PDF Media & Image Extractor')).toBeInTheDocument()
    expect(screen.getByText('Drop a PDF to extract all embedded images')).toBeInTheDocument()

    // Create a real PDF with an embedded 1x1 PNG and verify extraction + removal
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 300])
    const png1x1 = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21,
      196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 2, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73,
      69, 78, 68, 174, 66, 96, 130,
    ])
    const img = await doc.embedPng(png1x1)
    page.drawImage(img, { x: 20, y: 20, width: 100, height: 100 })
    const pdfBytes = await savePdf(doc)

    const extracted = await extractPdfImages(pdfBytes)
    expect(extracted.pageCount).toBe(1)
    expect(extracted.images.length).toBeGreaterThanOrEqual(1)
    expect(extracted.images[0].refKey).toBeTruthy()

    const edited = await applyPdfImageEdits(pdfBytes, {
      removeRefKeys: [extracted.images[0].refKey!],
    })
    expect(new TextDecoder().decode(edited.slice(0, 5))).toBe('%PDF-')
  })

  it('renders fresh Markdown Hub with Open .md box and persists recent saved files', () => {
    localStorage.clear()
    render(
      <MemoryRouter>
        <MarkdownRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('Markdown Studio')).toBeInTheDocument()
    expect(screen.getByText('Open .md File')).toBeInTheDocument()
    expect(screen.getByText('Recent & Saved Files')).toBeInTheDocument()

    // Create a new document, rename & save, then go back to Hub
    fireEvent.click(screen.getByRole('button', { name: /New Blank Document/i }))
    const nameInput = screen.getByLabelText('Markdown filename')
    fireEvent.change(nameInput, { target: { value: 'roadmap.md' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // Saved file card appears in Hub and reopens on click
    expect(screen.getByText('roadmap.md')).toBeInTheDocument()
    fireEvent.click(screen.getByText('roadmap.md'))
    expect(screen.getByDisplayValue('roadmap.md')).toBeInTheDocument()
  })
})
