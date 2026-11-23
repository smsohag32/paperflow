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
import {
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
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
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
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
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { putAsset, addHistory } from '@/lib/storage/repo'
import { listSignaturePresets } from '@/lib/image/signature'
import { PasswordRequiredError } from '@/lib/pdf/pdfjs'
import type { StoredSignature } from '@/lib/storage/db'
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
  const setActivePage = useWorkspace((s) => s.setActivePage)
  const toggleSelectPage = useWorkspace((s) => s.toggleSelectPage)
  const selectAllPages = useWorkspace((s) => s.selectAllPages)
  const setTool = useWorkspace((s) => s.setTool)
  const setToolStyle = useWorkspace((s) => s.setToolStyle)
  const setZoom = useWorkspace((s) => s.setZoom)
  const selectAnnotation = useWorkspace((s) => s.selectAnnotation)
  const reorderPages = useWorkspace((s) => s.reorderPages)
  const rotatePages = useWorkspace((s) => s.rotatePages)
  const deletePages = useWorkspace((s) => s.deletePages)
  const duplicatePage = useWorkspace((s) => s.duplicatePage)
  const insertBlankPage = useWorkspace((s) => s.insertBlankPage)
  const setCrop = useWorkspace((s) => s.setCrop)
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
  const [rightPanelOpen, setRightPanelOpen] = React.useState(false)
  const [signatures, setSignatures] = React.useState<StoredSignature[]>([])
  const [pwPrompt, setPwPrompt] = React.useState<{ file: File; append?: boolean; error?: string } | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [pageJump, setPageJump] = React.useState('')

  const openInputRef = React.useRef<HTMLInputElement>(null)
  const appendInputRef = React.useRef<HTMLInputElement>(null)
  const imgInputRef = React.useRef<HTMLInputElement>(null)
  const centerRef = React.useRef<HTMLDivElement>(null)

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

  const handleOpen = async (file: File, append = false, password?: string) => {
    try {
      if (append) await appendFile(file, { password })
      else await openFile(file, { password })
      setPwPrompt(null)
      toast.success(append ? `Appended ${file.name}` : `Opened ${file.name}`)
    } catch (e) {
      if (e instanceof PasswordRequiredError) {
        setPwPrompt({ file, append, error: e.incorrect ? 'Incorrect password.' : undefined })
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to open PDF')
      }
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
        setTool('select')
        selectAnnotation(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        if (selectedAnnotationId && activePage) {
          e.preventDefault()
          deleteAnnotation(activePage.id, selectedAnnotationId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, zoom, selectedAnnotationId, activePage, handleExport, undo, redo, selectAllPages, setZoom, setTool, selectAnnotation, deleteAnnotation])

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
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">PDF Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Open a PDF to reorganize pages, add annotations, signatures, watermarks, page numbers, or permanent redactions.
          </p>
        </div>
        <FileDropzone onFiles={(files) => files[0] && handleOpen(files[0])} />
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
    <Tabs defaultValue={selectedAnn ? 'element' : 'page'} className="flex h-full flex-col">
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
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="space-y-1">
                    <Label>Size ({selectedAnn.fontSize}pt)</Label>
                    <Input
                      type="number"
                      min={6}
                      max={96}
                      className="h-8"
                      value={selectedAnn.fontSize}
                      onChange={(e) =>
                        updateAnnotation(activePage.id, selectedAnn.id, { fontSize: Number(e.target.value) || 12 })
                      }
                    />
                  </div>
                </div>
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

            <div className="space-y-1.5">
              <Label>Opacity ({Math.round((selectedAnn.opacity ?? 1) * 100)}%)</Label>
              <Slider
                min={10}
                max={100}
                value={[Math.round((selectedAnn.opacity ?? 1) * 100)]}
                onValueChange={([v]) => updateAnnotation(activePage.id, selectedAnn.id, { opacity: v / 100 })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Rotation ({selectedAnn.rotation ?? 0}°)</Label>
              <Slider
                min={-180}
                max={180}
                value={[selectedAnn.rotation ?? 0]}
                onValueChange={([v]) => updateAnnotation(activePage.id, selectedAnn.id, { rotation: v })}
              />
            </div>
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
            <div className="space-y-1.5">
              <Label>Stroke width ({toolStyle.strokeWidth}px)</Label>
              <Slider
                min={1}
                max={12}
                value={[toolStyle.strokeWidth]}
                onValueChange={([v]) => setToolStyle({ strokeWidth: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Font size ({toolStyle.fontSize}pt)</Label>
              <Slider
                min={8}
                max={48}
                value={[toolStyle.fontSize]}
                onValueChange={([v]) => setToolStyle({ fontSize: v })}
              />
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
              <div className="space-y-1">
                <Label>Opacity ({Math.round(doc.watermark.opacity * 100)}%)</Label>
                <Slider
                  min={5}
                  max={60}
                  value={[Math.round(doc.watermark.opacity * 100)]}
                  onValueChange={([v]) => setWatermark({ opacity: v / 100 })}
                />
              </div>
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
    <div className="flex h-full flex-col overflow-hidden">
      <input
        ref={openInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleOpen(f, false)
          e.target.value = ''
        }}
      />
      <input
        ref={appendInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleOpen(f, true)
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
          <Tip label="Fullscreen">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden sm:inline-flex"
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
                else document.documentElement.requestFullscreen?.().catch(() => {})
              }}
            >
              <Maximize2 className="size-4" />
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

      {/* Quick page jump bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-1.5 text-xs">
          <span>Jump to page:</span>
          <Input
            type="number"
            min={1}
            max={doc.pages.length}
            value={pageJump}
            onChange={(e) => setPageJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const idx = parseInt(pageJump, 10) - 1
                if (idx >= 0 && idx < doc.pages.length) setActivePage(doc.pages[idx].id)
                setSearchOpen(false)
              }
            }}
            className="h-7 w-20"
            placeholder={`1–${doc.pages.length}`}
          />
          <Button variant="ghost" size="xs" onClick={() => setSearchOpen(false)}>
            Close
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
          <div className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
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
                      else setActivePage(p.id)
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

        {/* Center Canvas */}
        <div ref={centerRef} className="flex-1 overflow-auto bg-canvas p-6 scrollbar-thin">
          {activePage && (
            <PageCanvas
              page={activePage}
              zoom={zoom}
              tool={tool}
              toolStyle={toolStyle}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={selectAnnotation}
              onAddAnnotation={(ann) => addAnnotation(activePage.id, ann)}
              onUpdateAnnotation={(id, patch, rec) => updateAnnotation(activePage.id, id, patch, rec)}
              onDeleteAnnotation={(id) => deleteAnnotation(activePage.id, id)}
              onCropChange={(crop) => {
                setCrop([activePage.id], crop)
                setTool('select')
                toast.success('Crop box applied (will trim on export)')
              }}
            />
          )}
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
            onClick={() => setActivePage(doc.pages[activePageIndex - 1].id)}
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
            onClick={() => setActivePage(doc.pages[activePageIndex + 1].id)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden truncate sm:inline">{doc.name}</span>
          {dirty && <Badge variant="warning">Unsaved edits</Badge>}
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
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
