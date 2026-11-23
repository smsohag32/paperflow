import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { SmoothSizeSlider } from '@/components/ui/slider'
import DashboardRoute from '@/routes/DashboardRoute'
import CompareRoute from '@/routes/CompareRoute'

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
})
