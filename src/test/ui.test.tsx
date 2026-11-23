import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FileDropzone } from '@/components/upload/FileDropzone'
import DashboardRoute from '@/routes/DashboardRoute'

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
    expect(screen.getByText('Recent Documents')).toBeInTheDocument()
  })
})
