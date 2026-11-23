import type { Rotation, Rect } from '@/types/common'

export type EditorTool =
  | 'select'
  | 'pan'
  | 'text'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'draw'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'note'
  | 'image'
  | 'signature'
  | 'crop'
  | 'redact'

export type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier'

export interface BaseAnnotation {
  id: string
  /** Normalized coordinates (0..1) relative to unrotated page display box (top-left origin) */
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  opacity?: number
  zIndex?: number
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text'
  text: string
  fontFamily: FontFamily
  fontSize: number
  color: string
  bgColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface MarkupAnnotation extends BaseAnnotation {
  type: 'highlight' | 'underline' | 'strike'
  color: string
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'rect' | 'circle' | 'line' | 'arrow'
  stroke: string
  fill?: string
  strokeWidth: number
}

export interface DrawAnnotation extends BaseAnnotation {
  type: 'draw'
  /** Normalized points (0..1) in page coordinates */
  points: { x: number; y: number }[]
  stroke: string
  strokeWidth: number
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note'
  text: string
  color: string
  author?: string
}

export interface ImageAnnotation extends BaseAnnotation {
  type: 'image' | 'signature'
  /** Asset ID stored in IndexedDB `assets` store */
  assetId: string
  /** Optional cached object URL (transient, not persisted) */
  label?: string
}

export interface RedactAnnotation extends BaseAnnotation {
  type: 'redact'
  color: string
  label?: string
}

export type Annotation =
  | TextAnnotation
  | MarkupAnnotation
  | ShapeAnnotation
  | DrawAnnotation
  | NoteAnnotation
  | ImageAnnotation
  | RedactAnnotation

export interface WorkspacePage {
  id: string
  /** Source file id in IndexedDB `blobs` store, or null for a blank page */
  sourceId: string | null
  /** Zero-based page index inside the source PDF */
  sourcePageIndex: number
  /** Width & height in PDF points (72 pt = 1 in) */
  width: number
  height: number
  /** Additional rotation applied in workspace (degrees) */
  rotation: Rotation
  /** Optional crop rectangle in normalized 0..1 coordinates */
  crop?: Rect
  /** Optional background color for blank pages */
  bgColor?: string
  annotations: Annotation[]
}

export interface PageNumberConfig {
  enabled: boolean
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  format: 'n' | 'n-of-total' | 'page-n'
  startNumber: number
  fontSize: number
  color: string
  prefix: string
  suffix: string
  pageRange?: string
}

export interface WatermarkConfig {
  enabled: boolean
  kind: 'text' | 'image'
  text: string
  assetId?: string
  opacity: number
  rotation: number
  fontSize: number
  color: string
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  repeat: boolean
}

export interface HeaderFooterConfig {
  enabled: boolean
  headerLeft: string
  headerCenter: string
  headerRight: string
  footerLeft: string
  footerCenter: string
  footerRight: string
  fontSize: number
  color: string
}

export interface WorkspaceDoc {
  id: string
  name: string
  pages: WorkspacePage[]
  /** Passwords keyed by sourceId (in-memory only, never persisted to disk) */
  passwords?: Record<string, string>
  pageNumbers: PageNumberConfig
  watermark: WatermarkConfig
  headerFooter: HeaderFooterConfig
  updatedAt: number
}

export const DEFAULT_PAGE_NUMBERS: PageNumberConfig = {
  enabled: false,
  position: 'bottom-center',
  format: 'n-of-total',
  startNumber: 1,
  fontSize: 10,
  color: '#52525b',
  prefix: '',
  suffix: '',
}

export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  kind: 'text',
  text: 'CONFIDENTIAL',
  opacity: 0.18,
  rotation: -35,
  fontSize: 48,
  color: '#64748b',
  position: 'center',
  repeat: false,
}

export const DEFAULT_HEADER_FOOTER: HeaderFooterConfig = {
  enabled: false,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  fontSize: 9,
  color: '#64748b',
}
