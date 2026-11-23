export type Rotation = 0 | 90 | 180 | 270

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Metadata for a file kept in the local library (IndexedDB). Blob stored separately. */
export interface LibraryFile {
  id: string
  name: string
  size: number
  type: string
  createdAt: number
  lastOpenedAt: number
  pageCount?: number
  favorite?: boolean
  /** Small JPEG thumbnail blob id (in `previews` store) */
  hasPreview?: boolean
}

export interface ProcessingHistoryEntry {
  id?: number
  tool: string
  title: string
  inputNames: string[]
  outputNames: string[]
  outputSize?: number
  at: number
}

export interface OutputFile {
  name: string
  blob: Blob
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type PerformanceMode = 'auto' | 'high' | 'balanced' | 'low'
