import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FileDropzone } from '@/components/upload/FileDropzone'
import DashboardRoute from '@/routes/DashboardRoute'

describe('UI components', () => {
  it('renders FileDropzone with privacy badge', () => {
    const onFiles = vi.fn()
    render(<FileDropzone onFiles={onFiles} title="Upload PDF" />)
    expect(screen.getByText('Upload PDF')).toBeInTheDocument()
    expect(screen.getByText('Processed locally on your device')).toBeInTheDocument()
  })

  it('renders Dashboard with quick tools and local AI section', () => {
    render(
      <MemoryRouter>
        <DashboardRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('Quick Tools')).toBeInTheDocument()
    expect(screen.getAllByText('Merge PDF').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Compress PDF').length).toBeGreaterThan(0)
    expect(screen.getByText('Local AI Tools')).toBeInTheDocument()
  })
})
