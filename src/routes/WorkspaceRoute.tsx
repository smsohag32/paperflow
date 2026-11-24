import * as React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FolderOpen,
  Plus,
  RotateCw,
  Trash2,
  Copy,
  FilePlus2,
  MousePointer2,
  Hand,
  Type,
  Highlighter,
  Underline,
  Strikethrough,
  Pencil,
  Square,
  Circle,
  Minus,
  MoveUpRight,
  StickyNote,
  ImagePlus,
  PenTool,
  Crop,
  EyeOff,
  Save,
  RotateCcw,
  FileDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Search,
  ArrowUpDown,
  Stamp,
  X,
  FileText,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider, SmoothSizeSlider } from '@/components/ui/slider'
import { SimpleSelect } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tip } from '@/components/ui/tooltip'
import { Separator, Badge } from '@/components/ui/misc'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { PasswordDialog } from '@/components/shared/Dialogs'
import { PageThumbnail } from '@/components/pdf-viewer/PageThumbnail'
import { PageCanvas } from '@/components/editor/PageCanvas'
import { useWorkspace } from '@/stores/workspace'
import { exportWorkspacePdf } from '@/lib/pdf/export-workspace'
import { ACCEPTED_UNIVERSAL_FILES, ensurePdfFile } from '@/lib/pdf/convert'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import {
  putAsset,
  addHistory,
  listSavedProjects,
  deleteSavedProject,
  listLibraryFiles,
  getLibraryFile,
  deleteLibraryFile,
} from '@/lib/storage/repo'
import { listSignaturePresets } from '@/lib/image/signature'
import { PasswordRequiredError } from '@/lib/pdf/pdfjs'
import { getDocument } from '@/lib/pdf/render'
import { useProfile } from '@/lib/performance/profile'
import { formatBytes } from '@/lib/utils/format'
import type { StoredProject, StoredSignature } from '@/lib/storage/db'
import type { LibraryFile } from '@/types/common'
import type { EditorTool, FontFamily, WorkspacePage } from '@/types/workspace'
import { cn } from '@/lib/utils/cn'

function SortableThumb({
  page,
  index,
  active,
  selected,
  onSelect,
  onRotate,
  onDuplicate,
  onDelete,
  onExtract,
  onInsertBlank,
  canDelete,
}: {
  page: WorkspacePage
  index: number
  active: boolean
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onRotate: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExtract: () => void
  onInsertBlank: () => void
  canDelete: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          data-thumb-id={page.id}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          className={cn(
            'group relative flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors',
            active ? 'border-primary bg-primary/5' : selected ? 'border-primary/50 bg-secondary' : 'border-transparent hover:bg-secondary/60',
            isDragging && 'z-20 opacity-70 shadow-md',
          )}
        >
          <PageThumbnail
            sourceId={page.sourceId}
            sourcePageIndex={page.sourcePageIndex}
            rotation={page.rotation}
            bgColor={page.bgColor}
            priority={active ? 5 : 20}
          />
          <div className="flex w-full items-center justify-between px-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium">{index + 1}</span>
            {page.annotations.length > 0 && (
              <span className="rounded bg-primary/15 px-1 text-[10px] text-primary">{page.annotations.length}</span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRotate}>
          <RotateCw className="size-4" /> Rotate 90°
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="size-4" /> Duplicate page
        </ContextMenuItem>
        <ContextMenuItem onClick={onInsertBlank}>
          <FilePlus2 className="size-4" /> Insert blank after
        </ContextMenuItem>
        <ContextMenuItem onClick={onExtract}>
          <FileDown className="size-4" /> Extract page as PDF
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!canDelete} onClick={onDelete}>
          <Trash2 className="size-4" /> Delete page
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

const TOOL_BUTTONS: { id: EditorTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'select', label: 'Select / Move (Esc)', icon: MousePointer2 },
  { id: 'pan', label: 'Pan', icon: Hand },
  { id: 'text', label: 'Add Text Box', icon: Type },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'underline', label: 'Underline', icon: Underline },
  { id: 'strike', label: 'Strikethrough', icon: Strikethrough },
  { id: 'draw', label: 'Freehand Draw', icon: Pencil },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle / Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { id: 'note', label: 'Sticky Note', icon: StickyNote },
  { id: 'crop', label: 'Crop Page', icon: Crop },
  { id: 'redact', label: 'Permanent Redact', icon: EyeOff },
]

const STAMP_PRESETS = [
  { label: 'APPROVED', color: '#15803d', bgColor: '#dcfce7' },
  { label: 'CONFIDENTIAL', color: '#b91c1c', bgColor: '#fee2e2' },
  { label: 'DRAFT', color: '#b45309', bgColor: '#fef3c7' },
  { label: 'REVIEWED', color: '#1d4ed8', bgColor: '#dbeafe' },
  { label: 'PAID', color: '#0f766e', bgColor: '#ccfbf1' },
  { label: 'FINAL', color: '#6d28d9', bgColor: '#ede9fe' },
]

const STANDARD_PAGE_SIZES = [
  { label: 'A4', width: 595.28, height: 841.89 },
  { label: 'Letter', width: 612, height: 792 },
  { label: 'Legal', width: 612, height: 1008 },
  { label: 'A5', width: 419.53, height: 595.28 },
]

export default function WorkspaceRoute() {
  const doc = useWorkspace((s) => s.doc)
  const activePageId = useWorkspace((s) => s.activePageId)
  const selectedPageIds = useWorkspace((s) => s.selectedPageIds)
  const selectedAnnotationId = useWorkspace((s) => s.selectedAnnotationId)
  const tool = useWorkspace((s) => s.tool)
  const toolStyle = useWorkspace((s) => s.toolStyle)
  const zoom = useWorkspace((s) => s.zoom)
  const past = useWorkspace((s) => s.past)
  const future = useWorkspace((s) => s.future)
  const dirty = useWorkspace((s) => s.dirty)

  const openFile = useWorkspace((s) => s.openFile)
  const appendFile = useWorkspace((s) => s.appendFile)
  const saveProject = useWorkspace((s) => s.saveProject)
  const loadSavedProject = useWorkspace((s) => s.loadSavedProject)
  const closeDoc = useWorkspace((s) => s.closeDoc)
  const setActivePage = useWorkspace((s) => s.setActivePage)
  const toggleSelectPage = useWorkspace((s) => s.toggleSelectPage)
  const selectAllPages = useWorkspace((s) => s.selectAllPages)
  const selectPagesByPattern = useWorkspace((s) => s.selectPagesByPattern)
  const clearPageSelection = useWorkspace((s) => s.clearPageSelection)
  const setTool = useWorkspace((s) => s.setTool)
  const setToolStyle = useWorkspace((s) => s.setToolStyle)
  const setZoom = useWorkspace((s) => s.setZoom)
  const selectAnnotation = useWorkspace((s) => s.selectAnnotation)
  const reorderPages = useWorkspace((s) => s.reorderPages)
  const reversePages = useWorkspace((s) => s.reversePages)
  const rotatePages = useWorkspace((s) => s.rotatePages)
  const deletePages = useWorkspace((s) => s.deletePages)
  const duplicatePage = useWorkspace((s) => s.duplicatePage)
  const insertBlankPage = useWorkspace((s) => s.insertBlankPage)
  const setCrop = useWorkspace((s) => s.setCrop)
  const resizePages = useWorkspace((s) => s.resizePages)
  const addAnnotation = useWorkspace((s) => s.addAnnotation)
  const updateAnnotation = useWorkspace((s) => s.updateAnnotation)
  const deleteAnnotation = useWorkspace((s) => s.deleteAnnotation)
  const bringForward = useWorkspace((s) => s.bringForward)
  const sendBackward = useWorkspace((s) => s.sendBackward)
  const setPageNumbers = useWorkspace((s) => s.setPageNumbers)
  const setWatermark = useWorkspace((s) => s.setWatermark)
  const setHeaderFooter = useWorkspace((s) => s.setHeaderFooter)
  const undo = useWorkspace((s) => s.undo)
  const redo = useWorkspace((s) => s.redo)
  const restoreOriginal = useWorkspace((s) => s.restoreOriginal)

  const [exporting, setExporting] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [rightPanelOpen, setRightPanelOpen] = React.useState(false)
  const [panelTab, setPanelTab] = React.useState<'element' | 'page' | 'doc'>('page')
  const [signatures, setSignatures] = React.useState<StoredSignature[]>([])
  const [savedProjects, setSavedProjects] = React.useState<StoredProject[]>([])
  const [recentFiles, setRecentFiles] = React.useState<LibraryFile[]>([])

  const refreshSavedList = React.useCallback(() => {
    listSavedProjects(16).then(setSavedProjects).catch(() => {})
    listLibraryFiles(12).then(setRecentFiles).catch(() => {})
  }, [])

  React.useEffect(() => {
    if (!doc) refreshSavedList()
  }, [doc, refreshSavedList])

  React.useEffect(() => {
    if (selectedAnnotationId) setPanelTab('element')
  }, [selectedAnnotationId])
  const [pwPrompt, setPwPrompt] = React.useState<{ file: File; append?: boolean; error?: string } | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [pageJump, setPageJump] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchMatches, setSearchMatches] = React.useState<{ pageIndex: number; count: number; snippet: string }[]>([])
  const [matchCursor, setMatchCursor] = React.useState(0)
  const [searching, setSearching] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const openInputRef = React.useRef<HTMLInputElement>(null)
  const appendInputRef = React.useRef<HTMLInputElement>(null)
  const imgInputRef = React.useRef<HTMLInputElement>(null)
  const centerRef = React.useRef<HTMLDivElement>(null)
  const thumbListRef = React.useRef<HTMLDivElement>(null)

  // Keep active page thumbnail scrolled to the top of the left sidebar
  React.useEffect(() => {
    if (!activePageId || !thumbListRef.current) return
    const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(activePageId) : activePageId
    const el = thumbListRef.current.querySelector<HTMLElement>(`[data-thumb-id="${escaped}"]`)
    if (!el) return
    const container = thumbListRef.current
    const targetTop = Math.max(0, el.offsetTop - 8)
    container.scrollTo({ top: targetTop, behavior: 'smooth' })
  }, [activePageId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  React.useEffect(() => {
    listSignaturePresets().then(setSignatures).catch(() => {})
  }, [])

  const activePageIndex = doc ? Math.max(0, doc.pages.findIndex((p) => p.id === activePageId)) : 0
  const activePage = doc?.pages[activePageIndex] ?? null
  const selectedAnn = activePage?.annotations.find((a) => a.id === selectedAnnotationId) ?? null
  const profile = useProfile()

  const pageGap = 24
  const getPageItemSize = React.useCallback(
    (index: number) => {
      const p = doc?.pages[index]
      if (!p) return 840
      const swapped = p.rotation === 90 || p.rotation === 270
      return Math.round((swapped ? p.width : p.height) * zoom) + pageGap + 22
    },
    [doc?.pages, zoom],
  )

  const pageVirtualizer = useVirtualizer({
    count: doc?.pages.length ?? 0,
    getScrollElement: () => centerRef.current,
    estimateSize: getPageItemSize,
    overscan: Math.max(1, profile.prefetchPages),
  })

  // Re-measure virtual page heights whenever zoom or page count/rotations change
  const pageLayoutKey = doc?.pages.map((p) => `${p.id}:${p.rotation}`).join(',') ?? ''
  React.useEffect(() => {
    pageVirtualizer.measure()
  }, [zoom, pageLayoutKey, pageVirtualizer])

  const programmaticScrollUntilRef = React.useRef(0)
  const scrollRafRef = React.useRef<number | null>(null)

  const goToPageIndex = React.useCallback(
    (index: number, behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!doc || index < 0 || index >= doc.pages.length) return
      programmaticScrollUntilRef.current = performance.now() + 450
      setActivePage(doc.pages[index].id)
      pageVirtualizer.scrollToIndex(index, { align: 'start', behavior })
    },
    [doc, setActivePage, pageVirtualizer],
  )

  const handleViewerScroll = React.useCallback(() => {
    if (!doc || performance.now() < programmaticScrollUntilRef.current) return
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = centerRef.current
      if (!el || !doc) return
      const anchorY = el.scrollTop + Math.min(el.clientHeight * 0.35, 220)
      const items = pageVirtualizer.getVirtualItems()
      if (items.length === 0) return
      let best = items[0]
      for (const it of items) {
        if (it.start <= anchorY && it.end >= anchorY) {
          best = it
          break
        }
        if (Math.abs(it.start - anchorY) < Math.abs(best.start - anchorY)) best = it
      }
      const nextPage = doc.pages[best.index]
      if (nextPage && nextPage.id !== activePageId) {
        setActivePage(nextPage.id)
      }
    })
  }, [doc, activePageId, setActivePage, pageVirtualizer])

  React.useEffect(
    () => () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
    },
    [],
  )

  const handleOpen = async (file: File, append = false, password?: string) => {
    try {
      const { file: pdfFile, converted } = await ensurePdfFile(file)
      if (append) await appendFile(pdfFile, { password })
      else await openFile(pdfFile, { password })
      setPwPrompt(null)
      toast.success(
        append
          ? converted
            ? `Converted & appended ${file.name}`
            : `Appended ${file.name}`
          : converted
            ? `Converted ${file.name} to PDF`
            : `Opened ${file.name}`,
      )
    } catch (e) {
      if (e instanceof PasswordRequiredError) {
        setPwPrompt({ file, append, error: e.incorrect ? 'Incorrect password.' : undefined })
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to open file')
      }
    }
  }

  const handleOpenFiles = async (files: File[], append = false) => {
    if (files.length === 0) return
    if (files.length === 1) {
      await handleOpen(files[0], append)
      return
    }
    try {
      const prepared = await Promise.all(files.map((f) => ensurePdfFile(f)))
      if (append) {
        for (const p of prepared) await appendFile(p.file)
        toast.success(`Merged & appended ${prepared.length} files`)
      } else {
        await openFile(prepared[0].file)
        for (let i = 1; i < prepared.length; i++) await appendFile(prepared[i].file)
        toast.success(`Merged & opened ${prepared.length} files in Workspace`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open files')
    }
  }

  const handleExport = React.useCallback(
    async (pageIds?: string[]) => {
      if (!doc) return
      setExporting(true)
      try {
        const bytes = await exportWorkspacePdf(doc, { pageIds })
        const outName = pageIds?.length
          ? `${doc.name.replace(/\.pdf$/i, '')}-selected.pdf`
          : doc.name.endsWith('.pdf')
            ? doc.name
            : `${doc.name}.pdf`
        downloadBlob(pdfBlob(bytes), outName)
        await addHistory({
          tool: 'workspace',
          title: pageIds?.length ? 'Exported selected pages' : 'Exported edited PDF',
          inputNames: [doc.name],
          outputNames: [outName],
          outputSize: bytes.byteLength,
        })
        toast.success(`Exported ${outName}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Export failed')
      } finally {
        setExporting(false)
      }
    },
    [doc],
  )

  // Workspace keyboard shortcuts
  React.useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleExport()
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault()
        selectAllPages()
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setZoom(zoom + 0.15)
      } else if (mod && e.key === '-') {
        e.preventDefault()
        setZoom(zoom - 0.15)
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          setTool('select')
          selectAnnotation(null)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        if (selectedAnnotationId && activePage) {
          e.preventDefault()
          deleteAnnotation(activePage.id, selectedAnnotationId)
        }
      } else if (
        !typing &&
        !mod &&
        (e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'PageDown' ||
          e.key === 'PageUp' ||
          e.key === ' ')
      ) {
        const el = centerRef.current
        if (!el) return
        const goingDown = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)
        const step = e.key === 'ArrowDown' || e.key === 'ArrowUp' ? 110 : Math.max(240, el.clientHeight * 0.85)
        e.preventDefault()
        el.scrollBy({ top: goingDown ? step : -step, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    doc,
    zoom,
    selectedAnnotationId,
    activePage,
    handleExport,
    undo,
    redo,
    selectAllPages,
    setZoom,
    setTool,
    selectAnnotation,
    deleteAnnotation,
    isFullscreen,
  ])

  const handleDragEnd = (event: DragEndEvent) => {
    if (!doc) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = doc.pages.findIndex((p) => p.id === active.id)
    const newIdx = doc.pages.findIndex((p) => p.id === over.id)
    if (oldIdx >= 0 && newIdx >= 0) reorderPages(oldIdx, newIdx)
  }

  const handleInsertImage = async (file: File) => {
    if (!activePage) return
    try {
      const assetId = await putAsset(file)
      addAnnotation(activePage.id, {
        type: 'image',
        assetId,
        label: file.name,
        x: 0.2,
        y: 0.2,
        w: 0.3,
        h: 0.2,
        opacity: 1,
      })
      setTool('select')
      toast.success('Image placed on page')
    } catch {
      toast.error('Could not add image')
    }
  }

  const handlePlaceSignature = async (sig: StoredSignature) => {
    if (!activePage) return
    const assetId = await putAsset(sig.blob)
    const aspect = sig.width / Math.max(1, sig.height)
    const w = 0.24
    const h = Math.min(0.2, w / aspect)
    addAnnotation(activePage.id, {
      type: 'signature',
      assetId,
      label: sig.name,
      x: 0.35,
      y: 0.65,
      w,
      h,
      opacity: 1,
    })
    setTool('select')
    toast.success(`Placed "${sig.name}"`)
  }

  const handlePlaceStamp = (stamp: (typeof STAMP_PRESETS)[number]) => {
    if (!activePage) return
    addAnnotation(activePage.id, {
      type: 'text',
      text: stamp.label,
      fontFamily: 'Helvetica',
      fontSize: 22,
      color: stamp.color,
      bgColor: stamp.bgColor,
      bold: true,
      align: 'center',
      x: 0.32,
      y: 0.14,
      w: 0.34,
      h: 0.065,
      rotation: -12,
      opacity: 0.9,
    })
    setTool('select')
    toast.success(`Placed "${stamp.label}" stamp`)
  }

  // Focus search input when opened
  React.useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 40)
  }, [searchOpen])

  // Real in-document full-text search across all pages
  const runTextSearch = React.useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase()
      if (!doc || !q) {
        setSearchMatches([])
        setMatchCursor(0)
        return
      }
      setSearching(true)
      try {
        const matches: { pageIndex: number; count: number; snippet: string }[] = []
        const docCache = new Map<string, Awaited<ReturnType<typeof getDocument>>>()
        for (let i = 0; i < doc.pages.length; i++) {
          const p = doc.pages[i]
          let text = ''
          if (p.sourceId && p.sourcePageIndex >= 0) {
            let pdf = docCache.get(p.sourceId)
            if (!pdf) {
              pdf = await getDocument(p.sourceId)
              docCache.set(p.sourceId, pdf)
            }
            const page = await pdf.getPage(p.sourcePageIndex + 1)
            const tc = await page.getTextContent()
            text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ')
          }
          // Also include text annotations on the page
          const annText = p.annotations
            .map((a) => (a.type === 'text' || a.type === 'note' ? a.text : ''))
            .join(' ')
          const combined = `${text} ${annText}`.replace(/\s+/g, ' ').trim()
          const lower = combined.toLowerCase()
          let idx = lower.indexOf(q)
          let count = 0
          let firstIdx = -1
          while (idx !== -1) {
            if (firstIdx === -1) firstIdx = idx
            count++
            idx = lower.indexOf(q, idx + q.length)
          }
          if (count > 0) {
            const start = Math.max(0, firstIdx - 28)
            const end = Math.min(combined.length, firstIdx + q.length + 36)
            matches.push({
              pageIndex: i,
              count,
              snippet: `${start > 0 ? '…' : ''}${combined.slice(start, end)}${end < combined.length ? '…' : ''}`,
            })
          }
        }
        setSearchMatches(matches)
        setMatchCursor(0)
        if (matches.length > 0) goToPageIndex(matches[0].pageIndex)
      } catch {
        toast.error('Search failed on this document')
      } finally {
        setSearching(false)
      }
    },
    [doc, goToPageIndex],
  )

  const stepSearchMatch = (dir: -1 | 1) => {
    if (searchMatches.length === 0) return
    const next = (matchCursor + dir + searchMatches.length) % searchMatches.length
    setMatchCursor(next)
    goToPageIndex(searchMatches[next].pageIndex)
  }

  // Smooth Ctrl + Mouse Wheel zoom in center viewer
  React.useEffect(() => {
    const el = centerRef.current
    if (!el || !doc) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.08 : 0.92
      setZoom(Number((useWorkspace.getState().zoom * factor).toFixed(3)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc, setZoom])

  const fitWidth = () => {
    if (!activePage || !centerRef.current) return
    const avail = centerRef.current.clientWidth - 48
    const swapped = activePage.rotation === 90 || activePage.rotation === 270
    const baseW = swapped ? activePage.height : activePage.width
    setZoom(Math.min(2.5, Math.max(0.4, avail / baseW)), 'width')
  }

  const fitPage = () => {
    if (!activePage || !centerRef.current) return
    const availW = centerRef.current.clientWidth - 48
    const availH = centerRef.current.clientHeight - 48
    const swapped = activePage.rotation === 90 || activePage.rotation === 270
    const baseW = swapped ? activePage.height : activePage.width
    const baseH = swapped ? activePage.width : activePage.height
    setZoom(Math.min(2.5, Math.max(0.3, Math.min(availW / baseW, availH / baseH))), 'page')
  }

  if (!doc) {
    const formatAgo = (ts: number) => {
      const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
      if (sec < 45) return 'Just now'
      const min = Math.floor(sec / 60)
      if (min < 60) return `${min}m ago`
      const hr = Math.floor(min / 60)
      if (hr < 24) return `${hr}h ago`
      const day = Math.floor(hr / 24)
      if (day < 7) return `${day}d ago`
      return new Date(ts).toLocaleDateString()
    }

    const savedNames = new Set(savedProjects.map((p) => p.name.toLowerCase()))
    const uniqueRecentFiles = recentFiles.filter((f) => !savedNames.has(f.name.toLowerCase()))

    return (
      <div className="flex w-full flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">PDF Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Open a PDF to reorganize pages, add annotations, signatures, watermarks, page numbers, or permanent redactions.
          </p>
        </div>
        <FileDropzone
          multiple
          accept={ACCEPTED_UNIVERSAL_FILES}
          onFiles={(files) => files.length && handleOpenFiles(files, false)}
          title="Drop one or multiple PDFs, Markdown (.md), Word (.docx), or images"
          description="Select 1 file to open it directly, or multiple files to auto-convert & merge them into one Workspace"
        />

        {(savedProjects.length > 0 || uniqueRecentFiles.length > 0) && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {savedProjects.map((proj) => (
              <div
                key={proj.id}
                role="button"
                tabIndex={0}
                onClick={async () => {
                  try {
                    await loadSavedProject(proj.id)
                    toast.success(`Opened "${proj.name}"`)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not open saved project')
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    try {
                      await loadSavedProject(proj.id)
                      toast.success(`Opened "${proj.name}"`)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not open saved project')
                    }
                  }
                }}
                className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <FileText className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                        {proj.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {proj.pageCount} {proj.pageCount === 1 ? 'page' : 'pages'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    Saved
                  </Badge>
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatAgo(proj.updatedAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Delete saved project"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await deleteSavedProject(proj.id)
                      refreshSavedList()
                      toast.info(`Deleted "${proj.name}"`)
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            {uniqueRecentFiles.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={async () => {
                  try {
                    const loaded = await getLibraryFile(f.id)
                    if (!loaded) {
                      toast.error('File is no longer in local storage')
                      refreshSavedList()
                      return
                    }
                    await openFile(loaded.file, { existingSourceId: f.id })
                    toast.success(`Opened ${f.name}`)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not open file')
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    const loaded = await getLibraryFile(f.id)
                    if (loaded) await openFile(loaded.file, { existingSourceId: f.id })
                  }
                }}
                className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/12 group-hover:text-primary">
                      <FileText className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                        {f.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {formatBytes(f.size)}
                        {f.pageCount ? ` · ${f.pageCount} ${f.pageCount === 1 ? 'page' : 'pages'}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Recent
                  </Badge>
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatAgo(f.lastOpenedAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Remove from recent"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await deleteLibraryFile(f.id)
                      refreshSavedList()
                      toast.info(`Removed "${f.name}"`)
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <PasswordDialog
          open={!!pwPrompt}
          fileName={pwPrompt?.file.name ?? ''}
          error={pwPrompt?.error}
          onSubmit={(pw) => pwPrompt && handleOpen(pwPrompt.file, pwPrompt.append, pw)}
          onCancel={() => setPwPrompt(null)}
        />
      </div>
    )
  }

  const PropertiesContent = () => (
    <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as 'element' | 'page' | 'doc')} className="flex h-full flex-col">
      <TabsList className="mx-3 mt-3 w-[calc(100%-1.5rem)]">
        <TabsTrigger value="element">Element</TabsTrigger>
        <TabsTrigger value="page">Page</TabsTrigger>
        <TabsTrigger value="doc">Doc</TabsTrigger>
      </TabsList>

      {/* Element / Annotation Properties */}
      <TabsContent value="element" className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        {selectedAnn && activePage ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="primary" className="capitalize">
                {selectedAnn.type}
              </Badge>
              <div className="flex items-center gap-1">
                <Tip label="Bring forward">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => bringForward(activePage.id, selectedAnn.id)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                </Tip>
                <Tip label="Send backward">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => sendBackward(activePage.id, selectedAnn.id)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </Tip>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteAnnotation(activePage.id, selectedAnn.id)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {(selectedAnn.type === 'text' || selectedAnn.type === 'note') && (
              <div className="space-y-1.5">
                <Label>Text content</Label>
                <Textarea
                  rows={3}
                  value={selectedAnn.text}
                  onChange={(e) => updateAnnotation(activePage.id, selectedAnn.id, { text: e.target.value })}
                />
              </div>
            )}

            {selectedAnn.type === 'text' && (
              <>
                <div className="space-y-1">
                  <Label>Font</Label>
                  <SimpleSelect
                    size="sm"
                    value={selectedAnn.fontFamily}
                    onValueChange={(v) => updateAnnotation(activePage.id, selectedAnn.id, { fontFamily: v as FontFamily })}
                    options={[
                      { value: 'Helvetica', label: 'Sans' },
                      { value: 'TimesRoman', label: 'Serif' },
                      { value: 'Courier', label: 'Mono' },
                    ]}
                  />
                </div>
                <SmoothSizeSlider
                  label="Font size"
                  value={selectedAnn.fontSize}
                  min={6}
                  max={96}
                  step={1}
                  size="sm"
                  showSteppers
                  resetValue={14}
                  formatValue={(v) => `${v}pt`}
                  presets={[
                    { label: '10', value: 10 },
                    { label: '14', value: 14 },
                    { label: '18', value: 18 },
                    { label: '24', value: 24 },
                    { label: '36', value: 36 },
                  ]}
                  onChange={(v) => updateAnnotation(activePage.id, selectedAnn.id, { fontSize: v }, false)}
                />
                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant={selectedAnn.bold ? 'default' : 'outline'}
                    onClick={() => updateAnnotation(activePage.id, selectedAnn.id, { bold: !selectedAnn.bold })}
                  >
                    B
                  </Button>
                  <Button
                    size="xs"
                    variant={selectedAnn.italic ? 'default' : 'outline'}
                    onClick={() => updateAnnotation(activePage.id, selectedAnn.id, { italic: !selectedAnn.italic })}
                  >
                    I
                  </Button>
                  <Button
                    size="xs"
                    variant={selectedAnn.underline ? 'default' : 'outline'}
                    onClick={() =>
                      updateAnnotation(activePage.id, selectedAnn.id, { underline: !selectedAnn.underline })
                    }
                  >
                    U
                  </Button>
                  <input
                    type="color"
                    aria-label="Text color"
                    value={selectedAnn.color}
                    onChange={(e) => updateAnnotation(activePage.id, selectedAnn.id, { color: e.target.value })}
                    className="ml-auto h-7 w-9 cursor-pointer rounded border"
                  />
                </div>
              </>
            )}

            <SmoothSizeSlider
              label="Opacity"
              value={Math.round((selectedAnn.opacity ?? 1) * 100)}
              min={10}
              max={100}
              step={1}
              size="sm"
              resetValue={100}
              formatValue={(v) => `${v}%`}
              onChange={(v) => updateAnnotation(activePage.id, selectedAnn.id, { opacity: v / 100 }, false)}
            />

            <SmoothSizeSlider
              label="Rotation"
              value={selectedAnn.rotation ?? 0}
              min={-180}
              max={180}
              step={1}
              size="sm"
              resetValue={0}
              formatValue={(v) => `${v}°`}
              presets={[
                { label: '-90°', value: -90 },
                { label: '-15°', value: -15 },
                { label: '0°', value: 0 },
                { label: '15°', value: 15 },
                { label: '90°', value: 90 },
              ]}
              onChange={(v) => updateAnnotation(activePage.id, selectedAnn.id, { rotation: v }, false)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select an annotation on the page to edit it, or customize default styles for new overlays.
            </p>
            <div className="space-y-1.5">
              <Label>Default color</Label>
              <div className="flex items-center gap-2">
                {['#1e293b', '#4f46e5', '#dc2626', '#16a34a', '#ca8a04'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setToolStyle({ color: c })}
                    style={{ backgroundColor: c }}
                    className={cn(
                      'size-6 rounded-full border-2',
                      toolStyle.color === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                  />
                ))}
                <input
                  type="color"
                  value={toolStyle.color}
                  onChange={(e) => setToolStyle({ color: e.target.value })}
                  className="ml-auto h-6 w-8 cursor-pointer rounded border"
                />
              </div>
            </div>
            <SmoothSizeSlider
              label="Stroke width"
              value={toolStyle.strokeWidth}
              min={1}
              max={14}
              step={1}
              size="sm"
              showSteppers
              resetValue={2}
              formatValue={(v) => `${v}px`}
              preview={
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: `${Math.max(4, Math.min(16, toolStyle.strokeWidth + 2))}px`,
                    height: `${Math.max(4, Math.min(16, toolStyle.strokeWidth + 2))}px`,
                    backgroundColor: toolStyle.color,
                  }}
                />
              }
              onChange={(v) => setToolStyle({ strokeWidth: v })}
            />
            <SmoothSizeSlider
              label="Font size"
              value={toolStyle.fontSize}
              min={8}
              max={48}
              step={1}
              size="sm"
              showSteppers
              resetValue={14}
              formatValue={(v) => `${v}pt`}
              presets={[
                { label: '10pt', value: 10 },
                { label: '14pt', value: 14 },
                { label: '20pt', value: 20 },
                { label: '28pt', value: 28 },
              ]}
              onChange={(v) => setToolStyle({ fontSize: v })}
            />
            <Separator />
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Stamp className="size-3.5 text-primary" /> Quick Stamps
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {STAMP_PRESETS.map((st) => (
                  <button
                    key={st.label}
                    type="button"
                    onClick={() => handlePlaceStamp(st)}
                    style={{ color: st.color, borderColor: `${st.color}55`, backgroundColor: `${st.bgColor}66` }}
                    className="rounded-md border px-2 py-1 text-[10px] font-bold tracking-wider transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Saved Signatures</Label>
              {signatures.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Create reusable transparent signatures in Signature Studio.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {signatures.map((sig) => (
                    <Button
                      key={sig.id}
                      variant="outline"
                      size="xs"
                      className="justify-start truncate"
                      onClick={() => handlePlaceSignature(sig)}
                    >
                      <PenTool className="size-3 shrink-0" />
                      <span className="truncate">{sig.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </TabsContent>

      {/* Page Properties */}
      <TabsContent value="page" className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        {activePage && (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium">
                Page {activePageIndex + 1} of {doc.pages.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(activePage.width)} × {Math.round(activePage.height)} pt · Rotation {activePage.rotation}°
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  rotatePages(selectedPageIds.length ? selectedPageIds : [activePage.id], 90)
                }
              >
                <RotateCw className="size-3.5" /> Rotate 90°
              </Button>
              <Button variant="outline" size="sm" onClick={() => duplicatePage(activePage.id)}>
                <Copy className="size-3.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" onClick={() => insertBlankPage(activePage.id)}>
                <FilePlus2 className="size-3.5" /> Blank Page
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={doc.pages.length <= 1}
                onClick={() =>
                  deletePages(selectedPageIds.length ? selectedPageIds : [activePage.id])
                }
              >
                <Trash2 className="size-3.5 text-destructive" /> Delete
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Batch organize</Label>
                {selectedPageIds.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={clearPageSelection}>
                    Clear ({selectedPageIds.length})
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    selectPagesByPattern('odd')
                    toast.info('Selected odd pages')
                  }}
                >
                  Odd
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    selectPagesByPattern('even')
                    toast.info('Selected even pages')
                  }}
                >
                  Even
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={doc.pages.length < 2}
                  onClick={() => {
                    reversePages()
                    toast.success('Reversed page order')
                  }}
                >
                  <ArrowUpDown className="size-3" /> Reverse
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Standardize page size</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {STANDARD_PAGE_SIZES.map((sz) => (
                  <Button
                    key={sz.label}
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      const targets = selectedPageIds.length ? selectedPageIds : [activePage.id]
                      resizePages(targets, sz.width, sz.height)
                      toast.success(`Resized ${targets.length} page(s) to ${sz.label}`)
                    }}
                  >
                    {sz.label}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Crop box</Label>
                {activePage.crop && (
                  <Button variant="ghost" size="xs" onClick={() => setCrop([activePage.id], undefined)}>
                    Reset
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select the Crop tool in the toolbar and drag over the page to set a crop region.
              </p>
              {activePage.crop && (
                <Button
                  variant="outline"
                  size="xs"
                  className="w-full"
                  onClick={() => setCrop(doc.pages.map((p) => p.id), activePage.crop)}
                >
                  Apply crop to all pages
                </Button>
              )}
            </div>
            <Separator />
            <div className="rounded-lg border bg-secondary/40 p-2.5 text-[11px] text-muted-foreground">
              Annotations are stored as clean overlays on top of the PDF. Redaction boxes permanently rasterize &amp;
              burn out underlying text on export.
            </div>
          </>
        )}
      </TabsContent>

      {/* Document-wide Watermark, Page Numbers, Headers/Footers */}
      <TabsContent value="doc" className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Page numbers</Label>
            <Switch
              checked={doc.pageNumbers.enabled}
              onCheckedChange={(enabled) => setPageNumbers({ enabled })}
            />
          </div>
          {doc.pageNumbers.enabled && (
            <div className="space-y-2 pl-1">
              <SimpleSelect
                size="sm"
                value={doc.pageNumbers.position}
                onValueChange={(v) => setPageNumbers({ position: v as typeof doc.pageNumbers.position })}
                options={[
                  { value: 'bottom-center', label: 'Bottom center' },
                  { value: 'bottom-right', label: 'Bottom right' },
                  { value: 'bottom-left', label: 'Bottom left' },
                  { value: 'top-center', label: 'Top center' },
                  { value: 'top-right', label: 'Top right' },
                  { value: 'top-left', label: 'Top left' },
                ]}
              />
              <SimpleSelect
                size="sm"
                value={doc.pageNumbers.format}
                onValueChange={(v) => setPageNumbers({ format: v as typeof doc.pageNumbers.format })}
                options={[
                  { value: 'n-of-total', label: '1 / N' },
                  { value: 'page-n', label: 'Page 1' },
                  { value: 'n', label: '1' },
                ]}
              />
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Watermark</Label>
            <Switch
              checked={doc.watermark.enabled}
              onCheckedChange={(enabled) => setWatermark({ enabled })}
            />
          </div>
          {doc.watermark.enabled && (
            <div className="space-y-2 pl-1">
              <Input
                className="h-8"
                value={doc.watermark.text}
                onChange={(e) => setWatermark({ text: e.target.value })}
                placeholder="CONFIDENTIAL"
              />
              <SmoothSizeSlider
                label="Opacity"
                value={Math.round(doc.watermark.opacity * 100)}
                min={5}
                max={60}
                step={1}
                size="sm"
                resetValue={18}
                formatValue={(v) => `${v}%`}
                onChange={(v) => setWatermark({ opacity: v / 100 })}
              />
              <SmoothSizeSlider
                label="Font size"
                value={doc.watermark.fontSize}
                min={16}
                max={120}
                step={2}
                size="sm"
                resetValue={48}
                formatValue={(v) => `${v}pt`}
                onChange={(v) => setWatermark({ fontSize: v })}
              />
              <SmoothSizeSlider
                label="Angle"
                value={doc.watermark.rotation}
                min={-90}
                max={90}
                step={5}
                size="sm"
                resetValue={-35}
                formatValue={(v) => `${v}°`}
                onChange={(v) => setWatermark({ rotation: v })}
              />
              <div className="flex items-center justify-between">
                <Label>Tile across page</Label>
                <Switch
                  checked={doc.watermark.repeat}
                  onCheckedChange={(repeat) => setWatermark({ repeat })}
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Headers &amp; Footers</Label>
            <Switch
              checked={doc.headerFooter.enabled}
              onCheckedChange={(enabled) => setHeaderFooter({ enabled })}
            />
          </div>
          {doc.headerFooter.enabled && (
            <div className="space-y-2 pl-1">
              <Input
                className="h-8"
                placeholder="Header center (use {page} / {total})"
                value={doc.headerFooter.headerCenter}
                onChange={(e) => setHeaderFooter({ headerCenter: e.target.value })}
              />
              <Input
                className="h-8"
                placeholder="Footer center"
                value={doc.headerFooter.footerCenter}
                onChange={(e) => setHeaderFooter({ footerCenter: e.target.value })}
              />
            </div>
          )}
        </div>

        <Separator />

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            restoreOriginal()
            toast.info('Restored original document')
          }}
        >
          <RotateCcw className="size-3.5" /> Restore original
        </Button>
      </TabsContent>
    </Tabs>
  )

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-background',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'h-full',
      )}
    >
      <input
        ref={openInputRef}
        type="file"
        multiple
        accept={ACCEPTED_UNIVERSAL_FILES}
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length) handleOpenFiles(list, false)
          e.target.value = ''
        }}
      />
      <input
        ref={appendInputRef}
        type="file"
        multiple
        accept={ACCEPTED_UNIVERSAL_FILES}
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length) handleOpenFiles(list, true)
          e.target.value = ''
        }}
      />
      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleInsertImage(f)
          e.target.value = ''
        }}
      />

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
        <Tip label="Back to recent projects">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setIsFullscreen(false)
              closeDoc()
            }}
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Tip>
        <Tip label="Open PDF" shortcut="⌘O">
          <Button variant="ghost" size="icon-sm" onClick={() => openInputRef.current?.click()}>
            <FolderOpen className="size-4" />
          </Button>
        </Tip>
        <Tip label="Append another PDF">
          <Button variant="ghost" size="icon-sm" onClick={() => appendInputRef.current?.click()}>
            <Plus className="size-4" />
          </Button>
        </Tip>
        <Tip label="Save project locally">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await saveProject()
              toast.success('Project saved locally')
            }}
          >
            <Save className="size-4" />
          </Button>
        </Tip>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Tip label="Undo" shortcut="⌘Z">
          <Button variant="ghost" size="icon-sm" disabled={past.length === 0} onClick={undo}>
            <Undo2 className="size-4" />
          </Button>
        </Tip>
        <Tip label="Redo" shortcut="⇧⌘Z">
          <Button variant="ghost" size="icon-sm" disabled={future.length === 0} onClick={redo}>
            <Redo2 className="size-4" />
          </Button>
        </Tip>
        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Annotation tools */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {TOOL_BUTTONS.map((tb) => {
            const Icon = tb.icon
            return (
              <Tip key={tb.id} label={tb.label}>
                <Button
                  variant={tool === tb.id ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  className={cn(tool === tb.id && 'text-primary')}
                  onClick={() => setTool(tb.id)}
                >
                  <Icon className="size-4" />
                </Button>
              </Tip>
            )
          })}
          <Tip label="Insert image">
            <Button variant="ghost" size="icon-sm" onClick={() => imgInputRef.current?.click()}>
              <ImagePlus className="size-4" />
            </Button>
          </Tip>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Tip label="Zoom out">
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(zoom - 0.15)}>
              <ZoomOut className="size-4" />
            </Button>
          </Tip>
          <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Tip label="Zoom in">
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(zoom + 0.15)}>
              <ZoomIn className="size-4" />
            </Button>
          </Tip>
          <Button variant="ghost" size="xs" className="hidden sm:inline-flex" onClick={fitWidth}>
            Fit W
          </Button>
          <Button variant="ghost" size="xs" className="hidden sm:inline-flex" onClick={fitPage}>
            Fit P
          </Button>
          <Tip label="Jump to page" shortcut="⌘F">
            <Button variant="ghost" size="icon-sm" onClick={() => setSearchOpen((v) => !v)}>
              <Search className="size-4" />
            </Button>
          </Tip>
          <Tip label={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen View'}>
            <Button
              variant={isFullscreen ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </Tip>
          <Button
            variant="outline"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setRightPanelOpen(true)}
            aria-label="Properties"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
          <Button size="sm" disabled={exporting} onClick={() => handleExport()}>
            <Download className="size-3.5" />
            <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export PDF'}</span>
          </Button>
        </div>
      </div>

      {/* In-Document Full-Text Search & Page Jump Bar */}
      {searchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/40 px-4 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (searchMatches.length > 0 && !searching) {
                    stepSearchMatch(e.shiftKey ? -1 : 1)
                  } else {
                    runTextSearch(searchQuery)
                  }
                } else if (e.key === 'Escape') {
                  setSearchOpen(false)
                }
              }}
              className="h-7 w-52 text-xs"
              placeholder="Find text in document…"
            />
            <Button
              size="xs"
              variant="secondary"
              disabled={searching || !searchQuery.trim()}
              onClick={() => runTextSearch(searchQuery)}
            >
              {searching ? 'Searching…' : 'Find'}
            </Button>
            {searchMatches.length > 0 && (
              <>
                <span className="text-muted-foreground tabular-nums">
                  Page {searchMatches[matchCursor].pageIndex + 1} ({matchCursor + 1}/{searchMatches.length} pages)
                </span>
                <Button variant="ghost" size="icon-xs" onClick={() => stepSearchMatch(-1)} aria-label="Previous match">
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => stepSearchMatch(1)} aria-label="Next match">
                  <ChevronRight className="size-3.5" />
                </Button>
              </>
            )}
            {!searching && searchQuery.trim() && searchMatches.length === 0 && (
              <span className="text-muted-foreground">No matches</span>
            )}
          </div>

          <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Go to page:</span>
            <Input
              type="number"
              min={1}
              max={doc.pages.length}
              value={pageJump}
              onChange={(e) => setPageJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const idx = parseInt(pageJump, 10) - 1
                  if (idx >= 0 && idx < doc.pages.length) goToPageIndex(idx)
                  setSearchOpen(false)
                }
              }}
              className="h-7 w-18 text-xs"
              placeholder={`1–${doc.pages.length}`}
            />
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Main 3-Pane Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Thumbnails Sidebar */}
        <aside className="hidden w-44 shrink-0 flex-col border-r bg-sidebar sm:flex">
          <div className="flex items-center justify-between border-b px-2.5 py-2 text-xs font-medium">
            <span>Pages ({doc.pages.length})</span>
            <div className="flex items-center gap-0.5">
              <Tip label="Insert blank page">
                <Button variant="ghost" size="icon-xs" onClick={() => insertBlankPage(activePage?.id)}>
                  <FilePlus2 className="size-3.5" />
                </Button>
              </Tip>
              {selectedPageIds.length > 0 && (
                <Tip label="Export selected pages">
                  <Button variant="ghost" size="icon-xs" onClick={() => handleExport(selectedPageIds)}>
                    <FileDown className="size-3.5 text-primary" />
                  </Button>
                </Tip>
              )}
            </div>
          </div>
          <div ref={thumbListRef} className="relative flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={doc.pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {doc.pages.map((p, idx) => (
                  <SortableThumb
                    key={p.id}
                    page={p}
                    index={idx}
                    active={p.id === activePage?.id}
                    selected={selectedPageIds.includes(p.id)}
                    canDelete={doc.pages.length > 1}
                    onSelect={(e) => {
                      if (e.ctrlKey || e.metaKey || e.shiftKey) toggleSelectPage(p.id, true)
                      else goToPageIndex(idx)
                    }}
                    onRotate={() => rotatePages([p.id], 90)}
                    onDuplicate={() => duplicatePage(p.id)}
                    onDelete={() => deletePages([p.id])}
                    onExtract={() => handleExport([p.id])}
                    onInsertBlank={() => insertBlankPage(p.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </aside>

        {/* Center Canvas (Virtualized Continuous Scroll) */}
        <div
          ref={centerRef}
          tabIndex={0}
          aria-label="PDF Page Viewer"
          onScroll={handleViewerScroll}
          onPointerDown={(e) => {
            const el = e.target as HTMLElement | null
            if (!el?.closest('.pf-text-layer')) {
              centerRef.current?.focus({ preventScroll: true })
            }
          }}
          className="flex-1 overflow-auto bg-canvas px-4 py-6 outline-none scrollbar-thin sm:px-6"
        >
          <div
            style={{
              height: `${pageVirtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {pageVirtualizer.getVirtualItems().map((vItem) => {
              const p = doc.pages[vItem.index]
              if (!p) return null
              const isCurrent = p.id === activePage?.id
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  onPointerDown={() => {
                    if (p.id !== activePageId) setActivePage(p.id)
                  }}
                  className="flex flex-col items-center pb-6"
                >
                  <PageCanvas
                    page={p}
                    zoom={zoom}
                    tool={tool}
                    toolStyle={toolStyle}
                    selectedAnnotationId={isCurrent ? selectedAnnotationId : null}
                    onSelectAnnotation={(id) => {
                      if (p.id !== activePageId) setActivePage(p.id)
                      selectAnnotation(id)
                    }}
                    onAddAnnotation={(ann) => {
                      if (p.id !== activePageId) setActivePage(p.id)
                      return addAnnotation(p.id, ann)
                    }}
                    onUpdateAnnotation={(id, patch, rec) => updateAnnotation(p.id, id, patch, rec)}
                    onDeleteAnnotation={(id) => deleteAnnotation(p.id, id)}
                    onSwitchToSelect={() => setTool('select')}
                    onCropChange={(crop) => {
                      setCrop([p.id], crop)
                      setTool('select')
                      toast.success('Crop box applied (will trim on export)')
                    }}
                  />
                  <span className="mt-1.5 text-[11px] font-medium text-muted-foreground/80 tabular-nums">
                    Page {vItem.index + 1} of {doc.pages.length}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Context Panel (Desktop) */}
        <aside className="hidden w-72 shrink-0 flex-col border-l bg-card lg:flex">
          <PropertiesContent />
        </aside>
      </div>

      {/* Mobile Properties Sheet */}
      <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
        <SheetContent side="right" className="p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Properties</SheetTitle>
          </SheetHeader>
          <PropertiesContent />
        </SheetContent>
      </Sheet>

      {/* Bottom Status Bar */}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t bg-card px-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={activePageIndex <= 0}
            onClick={() => goToPageIndex(activePageIndex - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="tabular-nums">
            Page {activePageIndex + 1} / {doc.pages.length}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={activePageIndex >= doc.pages.length - 1}
            onClick={() => goToPageIndex(activePageIndex + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[200px] truncate md:inline">{doc.name}</span>
          {dirty && <Badge variant="warning">Unsaved edits</Badge>}
          <div className="hidden w-36 items-center gap-2 sm:flex">
            <Slider
              size="sm"
              min={25}
              max={300}
              step={5}
              resetValue={100}
              formatValue={(v) => `${v}%`}
              value={[Math.round(zoom * 100)]}
              onValueChange={([v]) => setZoom(v / 100)}
            />
          </div>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Click to reset zoom to 100%"
            className="w-10 text-right font-medium tabular-nums hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </footer>

      <PasswordDialog
        open={!!pwPrompt}
        fileName={pwPrompt?.file.name ?? ''}
        error={pwPrompt?.error}
        onSubmit={(pw) => pwPrompt && handleOpen(pwPrompt.file, pwPrompt.append, pw)}
        onCancel={() => setPwPrompt(null)}
      />
    </div>
  )
}
