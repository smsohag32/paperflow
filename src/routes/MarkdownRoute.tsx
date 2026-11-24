import * as React from 'react'
import {
  FileCode2,
  Upload,
  Copy,
  Check,
  Download,
  Eye,
  Columns2,
  Code2,
  ListTree,
  Printer,
  Sparkles,
  Trash2,
  Clock,
  Type,
  Maximize2,
  Minimize2,
  AlignLeft,
  Plus,
  ArrowLeft,
  Search,
  FilePlus2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MarkdownPreview, type ReaderFontSize } from '@/components/markdown/MarkdownPreview'
import {
  parseMarkdown,
  markdownToHtml,
  markdownToPlainText,
  buildStandaloneHtml,
  SAMPLE_MARKDOWN,
} from '@/lib/markdown/parser'
import { downloadBlob } from '@/lib/utils/download'
import { baseName } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

type ViewMode = 'preview' | 'split' | 'source'
type ReadingWidth = 'narrow' | 'comfortable' | 'wide'

interface SavedMarkdownDoc {
  id: string
  fileName: string
  content: string
  saved: boolean
  createdAt: number
  updatedAt: number
}

const MD_STORAGE_KEY = 'paperflow:markdown:docs:v1'

const WIDTH_CLASS: Record<ReadingWidth, string> = {
  narrow: 'max-w-2xl',
  comfortable: 'max-w-[860px]',
  wide: 'max-w-none',
}

const DEFAULT_SPLIT_RATIO = 50
const MIN_SPLIT_RATIO = 22
const MAX_SPLIT_RATIO = 78

const DEFAULT_OUTLINE_WIDTH = 240
const MIN_OUTLINE_WIDTH = 170
const MAX_OUTLINE_WIDTH = 420

function listSavedMdDocs(): SavedMarkdownDoc[] {
  try {
    const raw = localStorage.getItem(MD_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SavedMarkdownDoc[]
  } catch {
    return []
  }
}

function saveAllMdDocs(docs: SavedMarkdownDoc[]): SavedMarkdownDoc[] {
  const trimmed = docs.slice(0, 60)
  try {
    localStorage.setItem(MD_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore storage quota errors
  }
  return trimmed
}

function upsertSavedMdDoc(doc: SavedMarkdownDoc): SavedMarkdownDoc[] {
  const existing = listSavedMdDocs()
  const idx = existing.findIndex((d) => d.id === doc.id)
  // Preserve exact position when updating an existing file so it never jumps to #1!
  const next = idx >= 0 ? existing.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...existing]
  return saveAllMdDocs(next)
}

function deleteSavedMdDoc(id: string): SavedMarkdownDoc[] {
  const next = listSavedMdDocs().filter((d) => d.id !== id)
  return saveAllMdDocs(next)
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 45) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(ts).toLocaleDateString()
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export default function MarkdownRoute() {
  // Saved / Recent docs list
  const [savedDocs, setSavedDocs] = React.useState<SavedMarkdownDoc[]>(() => listSavedMdDocs())
  const [hubSearch, setHubSearch] = React.useState('')
  const [hubFilter, setHubFilter] = React.useState<'all' | 'saved' | 'draft'>('all')

  // Multi-tab editor session (activeId === null => Hub view)
  const [openTabIds, setOpenTabIds] = React.useState<string[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [isSaved, setIsSaved] = React.useState<boolean>(false)
  const [createdAt, setCreatedAt] = React.useState<number>(() => Date.now())
  const [content, setContent] = React.useState<string>('')
  const [fileName, setFileName] = React.useState<string>('untitled.md')
  const [viewMode, setViewMode] = React.useState<ViewMode>('split')
  const [fontSize, setFontSize] = React.useState<ReaderFontSize>('lg')
  const [readingWidth, setReadingWidth] = React.useState<ReadingWidth>('comfortable')
  const [showToc, setShowToc] = React.useState<boolean>(false)
  const [showFilesSidebar, setShowFilesSidebar] = React.useState<boolean>(true)
  const [sidebarSearch, setSidebarSearch] = React.useState<string>('')
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false)
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [pageDragging, setPageDragging] = React.useState<boolean>(false)

  // Smooth resizable layout state
  const [splitRatio, setSplitRatio] = React.useState<number>(DEFAULT_SPLIT_RATIO)
  const [outlineWidth, setOutlineWidth] = React.useState<number>(DEFAULT_OUTLINE_WIDTH)
  const [draggingHandle, setDraggingHandle] = React.useState<'split' | 'outline' | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const splitContainerRef = React.useRef<HTMLDivElement>(null)
  const gutterRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef<number | null>(null)
  const dirtyRef = React.useRef<boolean>(false)

  const doc = React.useMemo(() => parseMarkdown(content), [content])
  const lineCount = React.useMemo(() => Math.max(1, content.split('\n').length), [content])

  // Clean up any pending animation frame on unmount
  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Flush current active document ONLY if edited
  const flushActiveDoc = React.useCallback((): SavedMarkdownDoc[] => {
    if (!activeId || !dirtyRef.current) return savedDocs
    const updated: SavedMarkdownDoc = {
      id: activeId,
      fileName: fileName.trim() || 'untitled.md',
      content,
      saved: isSaved,
      createdAt,
      updatedAt: Date.now(),
    }
    dirtyRef.current = false
    const next = upsertSavedMdDoc(updated)
    setSavedDocs(next)
    return next
  }, [activeId, fileName, content, isSaved, createdAt, savedDocs])

  // Auto-save active document only when actually modified
  React.useEffect(() => {
    if (!activeId || !dirtyRef.current) return
    const timer = setTimeout(() => {
      const updated: SavedMarkdownDoc = {
        id: activeId,
        fileName: fileName.trim() || 'untitled.md',
        content,
        saved: isSaved,
        createdAt,
        updatedAt: Date.now(),
      }
      dirtyRef.current = false
      setSavedDocs(upsertSavedMdDoc(updated))
    }, 350)
    return () => clearTimeout(timer)
  }, [activeId, fileName, content, isSaved, createdAt])

  // Escape exits fullscreen cleanly
  React.useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const activateDoc = (item: SavedMarkdownDoc) => {
    dirtyRef.current = false
    setActiveId(item.id)
    setFileName(item.fileName)
    setContent(item.content)
    setIsSaved(item.saved)
    setCreatedAt(item.createdAt)
    setOpenTabIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
  }

  const openNewDoc = (initialName = 'untitled.md', initialContent = '', mode: ViewMode = 'split', markSaved = false) => {
    if (activeId) flushActiveDoc()
    const now = Date.now()
    const newDoc: SavedMarkdownDoc = {
      id: `md-${now}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: initialName,
      content: initialContent,
      saved: markSaved,
      createdAt: now,
      updatedAt: now,
    }
    setSavedDocs(upsertSavedMdDoc(newDoc))
    activateDoc(newDoc)
    setViewMode(mode)
  }

  const openSavedDoc = (item: SavedMarkdownDoc) => {
    if (activeId && activeId !== item.id) {
      const refreshed = flushActiveDoc()
      const freshTarget = refreshed.find((d) => d.id === item.id) ?? item
      activateDoc(freshTarget)
      return
    }
    activateDoc(item)
  }

  const closeTab = (id: string) => {
    if (id === activeId) flushActiveDoc()
    const nextTabs = openTabIds.filter((tid) => tid !== id)
    setOpenTabIds(nextTabs)
    if (activeId === id) {
      if (nextTabs.length === 0) {
        setActiveId(null)
        setIsFullscreen(false)
      } else {
        const nextId = nextTabs[nextTabs.length - 1]
        const target = savedDocs.find((d) => d.id === nextId)
        if (target) activateDoc(target)
        else setActiveId(null)
      }
    }
  }

  const handleBackToHub = () => {
    flushActiveDoc()
    setActiveId(null)
    setIsFullscreen(false)
  }

  const handleDuplicateDoc = (item: SavedMarkdownDoc) => {
    const now = Date.now()
    const copy: SavedMarkdownDoc = {
      ...item,
      id: `md-${now}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: `${baseName(item.fileName)}-copy.md`,
      createdAt: now,
      updatedAt: now,
    }
    setSavedDocs(upsertSavedMdDoc(copy))
    toast.success(`Duplicated ${item.fileName}`)
  }

  const handleDeleteDoc = (item: SavedMarkdownDoc) => {
    const nextDocs = deleteSavedMdDoc(item.id)
    setSavedDocs(nextDocs)
    const nextTabs = openTabIds.filter((tid) => tid !== item.id)
    setOpenTabIds(nextTabs)
    if (activeId === item.id) {
      const fallback = nextTabs.length ? nextDocs.find((d) => d.id === nextTabs[nextTabs.length - 1]) : null
      if (fallback) activateDoc(fallback)
      else {
        setActiveId(null)
        setIsFullscreen(false)
      }
    }
    toast.info(`Deleted ${item.fileName}`)
  }

  // Navigate Previous / Next across Recent & Saved files
  const activeListIndex = activeId ? savedDocs.findIndex((d) => d.id === activeId) : -1
  const navigateFile = (dir: -1 | 1) => {
    if (savedDocs.length <= 1 || activeListIndex < 0) return
    const nextIdx = (activeListIndex + dir + savedDocs.length) % savedDocs.length
    const target = savedDocs[nextIdx]
    if (target) openSavedDoc(target)
  }

  // Smooth VS Code-style sash resizing for Split & Outline
  const startResize = (handle: 'split' | 'outline', e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDraggingHandle(handle)
    const startX = e.clientX
    const startOutlineWidth = outlineWidth

    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (handle === 'split') {
          const container = splitContainerRef.current
          if (!container) return
          const rect = container.getBoundingClientRect()
          if (rect.width <= 0) return
          const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100
          setSplitRatio(Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, pct)))
        } else {
          const delta = startX - moveEvent.clientX
          const next = startOutlineWidth + delta
          setOutlineWidth(Math.min(MAX_OUTLINE_WIDTH, Math.max(MIN_OUTLINE_WIDTH, next)))
        }
      })
    }

    const onPointerUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
      setDraggingHandle(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const triggerCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.success(`Copied ${label}`)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800)
    } catch {
      toast.error('Clipboard access failed')
    }
  }

  // Open 1 or MULTIPLE .md files at once into tabs & recent list
  const loadFiles = async (files: File[]) => {
    const valid = files.filter((f) => /\.(md|markdown|mdx|txt)$/i.test(f.name) || f.type.startsWith('text/'))
    if (valid.length === 0) {
      toast.error('Please choose Markdown (.md, .markdown) or text files.')
      return
    }
    try {
      if (activeId) flushActiveDoc()
      const now = Date.now()
      const created: SavedMarkdownDoc[] = []
      for (let i = 0; i < valid.length; i++) {
        const f = valid[i]
        const text = await f.text()
        created.push({
          id: `md-${now + i}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: f.name,
          content: text,
          saved: true,
          createdAt: now + i,
          updatedAt: now + i,
        })
      }
      const existing = listSavedMdDocs()
      const merged = saveAllMdDocs([...created, ...existing])
      setSavedDocs(merged)
      setOpenTabIds((prev) => [...prev, ...created.map((c) => c.id)])
      activateDoc(created[0])
      setViewMode('split')
      toast.success(
        created.length === 1 ? `Opened ${created[0].fileName}` : `Opened ${created.length} Markdown files`,
      )
    } catch {
      toast.error('Could not read selected file(s)')
    }
  }

  const handleToggleTask = (taskIndex: number) => {
    let seen = 0
    const next = content.replace(/^(\s*[-*+]\s+\[)([ xX])(\]\s+)/gm, (match, pre, state, post) => {
      if (seen++ === taskIndex) {
        return `${pre}${state === ' ' ? 'x' : ' '}${post}`
      }
      return match
    })
    dirtyRef.current = true
    setContent(next)
  }

  const handlePrint = () => {
    const isDark = document.documentElement.classList.contains('dark')
    const html = buildStandaloneHtml(content, baseName(fileName), isDark)
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups to print or save as PDF.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => win.print(), 250)
  }

  const handleExportMd = (name = fileName, body = content) => {
    const outName = name.endsWith('.md') ? name : `${baseName(name)}.md`
    downloadBlob(new Blob([body], { type: 'text/markdown;charset=utf-8' }), outName)
    toast.success(`Downloaded ${outName}`)
  }

  const handleExportHtml = () => {
    const isDark = document.documentElement.classList.contains('dark')
    const outName = `${baseName(fileName)}.html`
    const html = buildStandaloneHtml(content, baseName(fileName), isDark)
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), outName)
    toast.success(`Downloaded ${outName}`)
  }

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredSavedDocs = React.useMemo(() => {
    const q = hubSearch.trim().toLowerCase()
    return savedDocs.filter((d) => {
      if (hubFilter === 'saved' && !d.saved) return false
      if (hubFilter === 'draft' && d.saved) return false
      if (!q) return true
      return d.fileName.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
    })
  }, [savedDocs, hubSearch, hubFilter])

  const sidebarDocs = React.useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    if (!q) return savedDocs
    return savedDocs.filter((d) => d.fileName.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
  }, [savedDocs, sidebarSearch])

  const openTabs = React.useMemo(() => {
    const byId = new Map(savedDocs.map((d) => [d.id, d]))
    return openTabIds
      .map((id) => {
        if (id === activeId) {
          return { id, fileName: fileName.trim() || 'untitled.md', saved: isSaved }
        }
        const found = byId.get(id)
        return found ? { id: found.id, fileName: found.fileName, saved: found.saved } : null
      })
      .filter(Boolean) as { id: string; fileName: string; saved: boolean }[]
  }, [openTabIds, savedDocs, activeId, fileName, isSaved])

  const outlineVisible = showToc && viewMode !== 'source'

  /* ═══════════════════════ VIEW 1: FRESH MARKDOWN HUB ═══════════════════════ */
  if (!activeId) {
    return (
      <div
        className="relative w-full space-y-8 px-4 py-6 md:px-6 lg:px-8"
        onDragOver={(e) => {
          e.preventDefault()
          if (!pageDragging) setPageDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setPageDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setPageDragging(false)
          const files = Array.from(e.dataTransfer.files)
          if (files.length) loadFiles(files)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : []
            if (list.length) loadFiles(list)
            e.target.value = ''
          }}
        />

        {pageDragging && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 shadow-lg">
              <FileCode2 className="size-10 text-primary" />
              <p className="text-base font-semibold">Drop one or multiple .md files to open</p>
              <p className="text-xs text-muted-foreground">Rendered locally — files never leave your device</p>
            </div>
          </div>
        )}

        {/* Fresh Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Markdown Studio</h1>
              <Badge variant="primary">Multi-File &amp; Live Preview</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open one or multiple <code>.md</code> files at once, switch between tabs, or reopen your saved files below.
            </p>
          </div>
          <Button size="sm" onClick={() => openNewDoc('untitled.md', '', 'split', false)}>
            <Plus className="size-4" /> New Markdown
          </Button>
        </div>

        {/* Top Action Boxes */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Quick Start</h2>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {/* Primary Open .md Action Box (supports multiple files) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex items-center gap-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 text-left transition-all hover:border-primary hover:bg-primary/10 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
                <Upload className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  Open .md Files
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Select or drop one or multiple <code>.md</code> / <code>.txt</code> files
                </div>
              </div>
            </button>

            {/* New Blank Document Box */}
            <button
              type="button"
              onClick={() => openNewDoc('untitled.md', '', 'split', false)}
              className="group flex items-center gap-4 rounded-2xl border bg-card p-5 text-left transition-all hover:border-primary/50 hover:bg-secondary/35 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <FilePlus2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  New Blank Document
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Start fresh with split editor &amp; live preview
                </div>
              </div>
            </button>

            {/* Sample Markdown Guide Box */}
            <button
              type="button"
              onClick={() => {
                openNewDoc('welcome-guide.md', SAMPLE_MARKDOWN, 'split', false)
                toast.success('Loaded sample Markdown')
              }}
              className="group flex items-center gap-4 rounded-2xl border bg-card p-5 text-left transition-all hover:border-primary/50 hover:bg-secondary/35 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  Try Sample Guide
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Explore tables, checklists, code blocks &amp; outline
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Recent & Saved Files List */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight">Recent &amp; Saved Files</h2>
              <Badge variant="outline">{savedDocs.length}</Badge>
            </div>

            {savedDocs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'saved', label: 'Saved' },
                      { id: 'draft', label: 'Drafts' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setHubFilter(f.id)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        hubFilter === f.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={hubSearch}
                    onChange={(e) => setHubSearch(e.target.value)}
                    placeholder="Search files…"
                    className="h-8 w-44 pl-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {savedDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <FileCode2 className="size-5" />
                </div>
                <p className="text-sm font-medium">No recent Markdown files yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Open one or multiple <code>.md</code> files or create a new document above. Everything you open or
                  save appears here automatically.
                </p>
              </CardContent>
            </Card>
          ) : filteredSavedDocs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No files match your search or filter.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredSavedDocs.map((item) => {
                const snippet = markdownToPlainText(item.content).replace(/\s+/g, ' ').trim()
                const words = countWords(item.content)
                const mins = Math.max(1, Math.round(words / 200))

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSavedDoc(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openSavedDoc(item)
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#007acc]/12 text-[#007acc] dark:bg-[#3794ff]/15 dark:text-[#3794ff]">
                            <FileCode2 className="size-4" />
                          </div>
                          <h3 className="truncate font-mono text-xs font-semibold text-foreground group-hover:text-primary">
                            {item.fileName}
                          </h3>
                        </div>
                        <Badge variant={item.saved ? 'success' : 'outline'} className="shrink-0 text-[10px]">
                          {item.saved ? 'Saved' : 'Draft'}
                        </Badge>
                      </div>

                      <p className="line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-muted-foreground">
                        {snippet || 'Empty Markdown document — click to start writing…'}
                      </p>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
                      <span className="truncate tabular-nums">
                        {words} words · {mins}m · {formatRelativeTime(item.updatedAt)}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Download .md"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportMd(item.fileName, item.content)
                          }}
                        >
                          <Download className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Duplicate"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicateDoc(item)
                          }}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteDoc(item)
                          }}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  /* ═══════════════════════ VIEW 2: MULTI-FILE VS CODE-STYLE EDITOR ═══════════════════════ */
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-background text-foreground',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'relative h-full w-full',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        if (!pageDragging) setPageDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setPageDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setPageDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) loadFiles(files)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length) loadFiles(list)
          e.target.value = ''
        }}
      />

      {pageDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 shadow-lg">
            <FileCode2 className="size-10 text-primary" />
            <p className="text-base font-semibold">Drop one or multiple .md files to open in tabs</p>
            <p className="text-xs text-muted-foreground">Rendered locally — files never leave your device</p>
          </div>
        </div>
      )}

      {/* Compact Responsive Multi-Tab Strip */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-secondary/50 px-2 py-1 scrollbar-thin">
        <Button
          size="xs"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleBackToHub}
          title="Back to Markdown Hub"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {/* Open File Tabs */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
          {openTabs.map((tab) => {
            const active = tab.id === activeId
            return (
              <div
                key={tab.id}
                onClick={() => {
                  if (active) return
                  const target = savedDocs.find((d) => d.id === tab.id)
                  if (target) openSavedDoc(target)
                }}
                className={cn(
                  'group flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-border bg-card font-medium text-foreground shadow-xs'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <FileCode2 className="size-3.5 shrink-0 text-[#007acc] dark:text-[#3794ff]" />
                {active ? (
                  <input
                    type="text"
                    value={fileName}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      dirtyRef.current = true
                      setFileName(e.target.value)
                    }}
                    aria-label="Markdown filename"
                    className="w-24 bg-transparent font-medium text-foreground outline-none focus:underline sm:w-32"
                  />
                ) : (
                  <span className="truncate">{tab.fileName}</span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${tab.fileName}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="rounded p-0.5 text-muted-foreground opacity-50 hover:bg-secondary hover:text-foreground hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            )
          })}

          <Button
            size="icon-xs"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="New Markdown tab"
            aria-label="New Markdown tab"
            onClick={() => openNewDoc('untitled.md', '', 'split', false)}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            title="Open one or multiple .md files"
          >
            <Upload className="size-3.5" />
            <span className="hidden md:inline">Open</span>
          </Button>
        </div>
      </div>

      {/* Ultra-Compact Responsive Actions Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-border bg-card px-2 py-1">
        <div className="flex flex-wrap items-center gap-1">
          {/* Mobile-only Files toggle (desktop toggle lives inside the Files sidebar itself) */}
          <Button
            size="icon-xs"
            variant={showFilesSidebar ? 'secondary' : 'ghost'}
            className="md:hidden"
            onClick={() => setShowFilesSidebar((v) => !v)}
            title="Toggle Files list"
          >
            {showFilesSidebar ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
          </Button>

          {/* Prev / Next File Navigation */}
          {savedDocs.length > 1 && (
            <div className="inline-flex items-center rounded-md border border-border bg-background/70 p-0.5">
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-6"
                onClick={() => navigateFile(-1)}
                title="Previous file"
                aria-label="Previous recent file"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-1 text-[11px] text-muted-foreground tabular-nums">
                {activeListIndex + 1}/{savedDocs.length}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-6"
                onClick={() => navigateFile(1)}
                title="Next file"
                aria-label="Next recent file"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}

          {/* View Mode Toggle (Preview / Split / Source) */}
          <div className="inline-flex rounded-md border border-border bg-background/70 p-0.5">
            {(
              [
                { id: 'preview', label: 'Preview', icon: Eye },
                { id: 'split', label: 'Split', icon: Columns2 },
                { id: 'source', label: 'Source', icon: Code2 },
              ] as const
            ).map((m) => {
              const Icon = m.icon
              const active = viewMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Compact Controls */}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!content.trim()}
            onClick={() => triggerCopy(markdownToPlainText(content), 'text', 'preview text')}
            title="Copy readable plain text"
          >
            {copiedKey === 'text' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            <span className="hidden lg:inline">Copy Text</span>
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={!content.trim()}
            onClick={() => triggerCopy(content, 'md', 'raw Markdown')}
            title="Copy raw Markdown source"
          >
            {copiedKey === 'md' ? <Check className="size-3 text-success" /> : <FileCode2 className="size-3" />}
            <span className="hidden lg:inline">Copy MD</span>
          </Button>

          {/* Font Size */}
          <div className="hidden items-center gap-0.5 rounded-md border border-border bg-background/70 px-1 py-0.5 xl:inline-flex">
            <Type className="mx-0.5 size-3 text-muted-foreground" />
            {(['sm', 'md', 'lg'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setFontSize(sz)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                  fontSize === sz ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {sz}
              </button>
            ))}
          </div>

          {/* Reading Width */}
          <div className="hidden items-center gap-0.5 rounded-md border border-border bg-background/70 px-1 py-0.5 2xl:inline-flex">
            {(
              [
                { id: 'narrow', label: 'Compact' },
                { id: 'comfortable', label: 'Standard' },
                { id: 'wide', label: 'Wide' },
              ] as const
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setReadingWidth(w.id)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                  readingWidth === w.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Outline Toggle */}
          {viewMode !== 'source' && (
            <Button
              size="xs"
              variant={showToc ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setShowToc((v) => !v)}
              title="Toggle Outline Sidebar"
            >
              <ListTree className="size-3.5" />
              <span className="hidden xl:inline">Outline</span>
            </Button>
          )}

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="outline" className="h-7 px-2 text-xs" disabled={!content.trim()}>
                <Download className="size-3" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => triggerCopy(markdownToHtml(content), 'html', 'HTML')}>
                <Code2 className="size-4" /> Copy Rendered HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportMd()}>
                <FileCode2 className="size-4" /> Download Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportHtml}>
                <Download className="size-4" /> Download Themed HTML (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="size-4" /> Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Fullscreen Content Mode */}
          <Button
            size="xs"
            variant={isFullscreen ? 'default' : 'outline'}
            className="h-7 px-2 text-xs"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Content View'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </Button>
        </div>
      </div>

      {/* Main Surface: Collapsible Recent Files Sidebar + Resizable Split + Outline */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Recent / Saved Files Navigator Sidebar (collapse button lives inside Files section) */}
        {showFilesSidebar ? (
          <aside className="absolute inset-y-0 left-0 z-20 flex w-56 shrink-0 flex-col border-r border-border bg-card shadow-lg md:static md:bg-secondary/20 md:shadow-none">
            <div className="flex items-center justify-between border-b border-border/60 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Files ({savedDocs.length})
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Open .md files"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="New .md file"
                  onClick={() => openNewDoc('untitled.md', '', 'split', false)}
                >
                  <Plus className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Collapse Files panel"
                  aria-label="Collapse Files panel"
                  onClick={() => setShowFilesSidebar(false)}
                >
                  <PanelLeftClose className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="border-b border-border/50 p-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Filter files…"
                  className="h-7 pl-7 text-[11px]"
                />
              </div>
            </div>

            <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5 scrollbar-thin">
              {sidebarDocs.map((item) => {
                const isActive = item.id === activeId
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSavedDoc(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openSavedDoc(item)
                      }
                    }}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
                      isActive
                        ? 'bg-primary/12 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <FileCode2 className="size-3.5 shrink-0 opacity-80" />
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11.5px]">
                          {isActive ? fileName : item.fileName}
                        </div>
                        <div className="text-[10px] opacity-70 tabular-nums">
                          {formatRelativeTime(item.updatedAt)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      title={`Delete ${item.fileName}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDoc(item)
                      }}
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </aside>
        ) : (
          /* Collapsed Slim Rail inside Files section to re-expand cleanly */
          <div className="hidden w-9 shrink-0 flex-col items-center gap-2 border-r border-border bg-secondary/20 py-2 md:flex">
            <Button
              size="icon-xs"
              variant="ghost"
              title="Expand Files panel"
              aria-label="Expand Files panel"
              onClick={() => setShowFilesSidebar(true)}
            >
              <PanelLeftOpen className="size-3.5" />
            </Button>
            <span className="rounded bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {savedDocs.length}
            </span>
          </div>
        )}

        {/* Center Editor + Preview Container */}
        <div
          ref={splitContainerRef}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 overflow-hidden',
            viewMode === 'split' ? 'flex-col md:flex-row' : 'flex-col',
          )}
        >
          {/* Source Editor Pane */}
          {(viewMode === 'source' || viewMode === 'split') && (
            <div
              style={viewMode === 'split' ? { flexBasis: `${splitRatio}%` } : undefined}
              className={cn(
                'flex min-h-[240px] min-w-0 flex-col bg-background',
                viewMode === 'split'
                  ? 'shrink-0 grow-0 border-b border-border md:min-h-0 md:border-b-0'
                  : 'flex-1',
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/25 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="min-w-0 truncate font-mono">{fileName}</span>
                <button
                  type="button"
                  disabled={!content}
                  onClick={() => triggerCopy(content, 'source-bar', 'Markdown source')}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-secondary hover:text-foreground disabled:opacity-40"
                >
                  {copiedKey === 'source-bar' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                  Copy Source
                </button>
              </div>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  className="shrink-0 select-none overflow-hidden border-r border-border/50 bg-secondary/20 px-3 py-4 text-right font-mono text-[13px] leading-[1.6] text-muted-foreground/60"
                >
                  {Array.from({ length: lineCount }, (_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <textarea
                  value={content}
                  onChange={(e) => {
                    dirtyRef.current = true
                    setContent(e.target.value)
                  }}
                  onScroll={(e) => {
                    if (gutterRef.current) {
                      gutterRef.current.scrollTop = e.currentTarget.scrollTop
                    }
                  }}
                  spellCheck={false}
                  placeholder={'# Start typing or paste Markdown here...\n\nOr drop one or multiple .md files anywhere on this window.'}
                  className="h-full w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.6] text-foreground outline-none scrollbar-thin"
                />
              </div>
            </div>
          )}

          {/* Smooth Draggable Split Resize Sash */}
          {viewMode === 'split' && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and preview panes"
              title="Drag to resize · Double-click to reset 50/50"
              onPointerDown={(e) => startResize('split', e)}
              onDoubleClick={() => setSplitRatio(DEFAULT_SPLIT_RATIO)}
              className={cn(
                'group relative hidden w-1 shrink-0 cursor-col-resize bg-border/80 transition-colors hover:bg-primary/70 md:block',
                draggingHandle === 'split' && 'bg-primary',
              )}
            >
              <div className="absolute inset-y-0 -right-1.5 -left-1.5 z-10" />
            </div>
          )}

          {/* Live Markdown Preview Pane */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card text-card-foreground">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/25 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="min-w-0 truncate font-mono">Preview · {fileName}</span>
                <button
                  type="button"
                  disabled={!content.trim()}
                  onClick={() => triggerCopy(markdownToPlainText(content), 'preview-bar', 'preview text')}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-secondary hover:text-foreground disabled:opacity-40"
                >
                  {copiedKey === 'preview-bar' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                  Copy Preview
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-10 sm:py-8 scrollbar-thin">
                <div className={cn('mx-auto w-full', WIDTH_CLASS[readingWidth])}>
                  {content.trim() ? (
                    <MarkdownPreview
                      blocks={doc.blocks}
                      fontSize={fontSize}
                      onToggleTask={handleToggleTask}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                        <FileCode2 className="size-5" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Live Markdown Preview</p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                        Start writing or pasting Markdown on the left, or drop multiple <code>.md</code> files here.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <Button size="xs" variant="default" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="size-3" /> Open .md Files
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setContent(SAMPLE_MARKDOWN)
                            setFileName('welcome-guide.md')
                          }}
                        >
                          <Sparkles className="size-3" /> Load Sample
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Smooth Draggable Outline Resize Sash */}
        {outlineVisible && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize outline sidebar"
            title="Drag to resize outline · Double-click to reset"
            onPointerDown={(e) => startResize('outline', e)}
            onDoubleClick={() => setOutlineWidth(DEFAULT_OUTLINE_WIDTH)}
            className={cn(
              'group relative hidden w-1 shrink-0 cursor-col-resize bg-border/80 transition-colors hover:bg-primary/70 lg:block',
              draggingHandle === 'outline' && 'bg-primary',
            )}
          >
            <div className="absolute inset-y-0 -right-1.5 -left-1.5 z-10" />
          </div>
        )}

        {/* Resizable Outline Sidebar */}
        {outlineVisible && (
          <aside
            style={{ width: `${outlineWidth}px` }}
            className="hidden shrink-0 flex-col bg-secondary/20 lg:flex"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <span className="inline-flex items-center gap-1.5">
                <ListTree className="size-3.5 text-[#007acc] dark:text-[#3794ff]" />
                Outline
              </span>
              {doc.headings.length > 0 && (
                <span className="font-mono text-[10px] font-normal text-muted-foreground/80">
                  {doc.headings.length}
                </span>
              )}
            </div>
            <nav aria-label="Document outline" className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
              {doc.headings.length > 0 ? (
                doc.headings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => scrollToHeading(h.id)}
                    style={{ paddingLeft: `${Math.max(0, h.level - 1) * 10 + 8}px` }}
                    className="block w-full truncate rounded py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                    title={h.text}
                  >
                    {h.text}
                  </button>
                ))
              ) : (
                <p className="px-2 py-4 text-xs text-muted-foreground/75">
                  Headings (<code>#</code>, <code>##</code>) will appear here as an outline.
                </p>
              )}
            </nav>
          </aside>
        )}
      </div>

      {/* Bottom Status Bar */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
            <FileCode2 className="size-3 text-[#007acc] dark:text-[#3794ff]" /> Markdown
          </span>
          <span>UTF-8</span>
          <span>Ln {doc.stats.lines}</span>
          {openTabs.length > 1 && <span>{openTabs.length} open tabs</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <AlignLeft className="size-3" /> {doc.stats.words.toLocaleString()} words
          </span>
          <span className="hidden sm:inline">{doc.stats.chars.toLocaleString()} chars</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {doc.stats.readingMinutes} min read
          </span>
        </div>
      </footer>
    </div>
  )
}
