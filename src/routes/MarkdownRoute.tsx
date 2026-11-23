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
  AlignLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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

export default function MarkdownRoute() {
  const [content, setContent] = React.useState<string>('')
  const [fileName, setFileName] = React.useState<string>('untitled.md')
  const [viewMode, setViewMode] = React.useState<ViewMode>('split')
  const [fontSize, setFontSize] = React.useState<ReaderFontSize>('lg')
  const [readingWidth, setReadingWidth] = React.useState<ReadingWidth>('comfortable')
  const [showToc, setShowToc] = React.useState<boolean>(false)
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

  const doc = React.useMemo(() => parseMarkdown(content), [content])
  const lineCount = React.useMemo(() => Math.max(1, content.split('\n').length), [content])

  // Clean up any pending animation frame on unmount
  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

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

  const loadFiles = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    if (!/\.(md|markdown|mdx|txt)$/i.test(f.name) && !f.type.startsWith('text/')) {
      toast.error('Please choose a Markdown (.md, .markdown) or text file.')
      return
    }
    try {
      const text = await f.text()
      setContent(text)
      setFileName(f.name)
      toast.success(`Opened ${f.name}`)
    } catch {
      toast.error('Could not read file')
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

  const handleExportMd = () => {
    const outName = fileName.endsWith('.md') ? fileName : `${baseName(fileName)}.md`
    downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), outName)
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

  const outlineVisible = showToc && viewMode !== 'source'

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground"
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
            <p className="text-base font-semibold">Drop your .md file to open in Preview</p>
            <p className="text-xs text-muted-foreground">Rendered locally — files never leave your device</p>
          </div>
        </div>
      )}

      {/* VS Code-style Editor Tab Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/45 px-2 pt-1.5">
        {/* Active File Tabs */}
        <div className="flex min-w-0 items-end gap-1">
          <div className="flex items-center gap-2 rounded-t-md border border-b-0 border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
            <FileCode2 className="size-3.5 shrink-0 text-[#007acc] dark:text-[#3794ff]" />
            <span className="text-muted-foreground">
              {viewMode === 'preview' ? 'Preview' : viewMode === 'split' ? 'Split' : 'Source'}
            </span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              aria-label="Markdown filename"
              className="w-32 bg-transparent font-medium text-foreground outline-none focus:underline sm:w-44"
            />
          </div>

          <Button
            size="xs"
            variant="ghost"
            className="mb-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" /> Open .md
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="mb-1 hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
            onClick={() => {
              setContent(SAMPLE_MARKDOWN)
              setFileName('welcome-guide.md')
              toast.success('Loaded sample Markdown')
            }}
          >
            <Sparkles className="size-3.5" /> Sample
          </Button>
        </div>

        {/* VS Code-style Right Toolbar Actions */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5 pr-1">
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
                    'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors',
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

          {/* Copyable Content Quick Buttons */}
          <Button
            size="xs"
            variant="outline"
            disabled={!content.trim()}
            onClick={() => triggerCopy(markdownToPlainText(content), 'text', 'preview text')}
            title="Copy readable plain text"
          >
            {copiedKey === 'text' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            Copy Text
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!content.trim()}
            onClick={() => triggerCopy(content, 'md', 'raw Markdown')}
            title="Copy raw Markdown source"
          >
            {copiedKey === 'md' ? <Check className="size-3 text-success" /> : <FileCode2 className="size-3" />}
            Copy MD
          </Button>

          {/* Font Size & Width */}
          <div className="hidden items-center gap-0.5 rounded-md border border-border bg-background/70 px-1 py-0.5 xl:inline-flex">
            <Type className="mx-0.5 size-3 text-muted-foreground" />
            {(['sm', 'md', 'lg'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setFontSize(sz)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase',
                  fontSize === sz ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {sz}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-0.5 rounded-md border border-border bg-background/70 px-1 py-0.5 2xl:inline-flex">
            <Maximize2 className="mx-0.5 size-3 text-muted-foreground" />
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
                  'rounded px-1.5 py-0.5 text-[10.5px] font-medium',
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
              onClick={() => setShowToc((v) => !v)}
              title="Toggle Outline Sidebar"
            >
              <ListTree className="size-3.5" />
              <span className="hidden md:inline">Outline</span>
            </Button>
          )}

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="outline" disabled={!content.trim()}>
                <Download className="size-3" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => triggerCopy(markdownToHtml(content), 'html', 'HTML')}>
                <Code2 className="size-4" /> Copy Rendered HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMd}>
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

          {content && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Clear file"
              title="Clear file"
              onClick={() => {
                setContent('')
                setFileName('untitled.md')
              }}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Main VS Code-style Resizable Split & Outline Surface */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left/Right Editor + Preview Container */}
        <div
          ref={splitContainerRef}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 overflow-hidden',
            viewMode === 'split' ? 'flex-col md:flex-row' : 'flex-col',
          )}
        >
          {/* Source Editor Pane (with VS Code-style line number gutter) */}
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
              <div className="flex items-center justify-between border-b border-border/60 bg-secondary/25 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">{fileName}</span>
                <button
                  type="button"
                  disabled={!content}
                  onClick={() => triggerCopy(content, 'source-bar', 'Markdown source')}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground disabled:opacity-40"
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
                  onChange={(e) => setContent(e.target.value)}
                  onScroll={(e) => {
                    if (gutterRef.current) {
                      gutterRef.current.scrollTop = e.currentTarget.scrollTop
                    }
                  }}
                  spellCheck={false}
                  placeholder={'# Start typing or paste Markdown here...\n\nOr drop a .md file anywhere on this window.'}
                  className="h-full w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.6] text-foreground outline-none scrollbar-thin"
                />
              </div>
            </div>
          )}

          {/* Smooth Draggable Split Resize Sash (VS Code style) */}
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
              {/* Wider invisible hit target for effortless grabbing */}
              <div className="absolute inset-y-0 -right-1.5 -left-1.5 z-10" />
            </div>
          )}

          {/* VS Code-style Theme-Based Markdown Preview Pane */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card text-card-foreground">
              <div className="flex items-center justify-between border-b border-border/60 bg-secondary/25 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">Preview {fileName}</span>
                <button
                  type="button"
                  disabled={!content.trim()}
                  onClick={() => triggerCopy(markdownToPlainText(content), 'preview-bar', 'preview text')}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground disabled:opacity-40"
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
                        Start writing or pasting Markdown on the left, drop a <code>.md</code> file here, or open one
                        from your device.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <Button size="xs" variant="default" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="size-3" /> Open .md File
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

        {/* Smooth Draggable Outline Resize Sash (lg+ screens) */}
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

        {/* VS Code-style Resizable Outline Sidebar (lg+) */}
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

      {/* VS Code-style Bottom Status Bar */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
            <FileCode2 className="size-3 text-[#007acc] dark:text-[#3794ff]" /> Markdown
          </span>
          <span>UTF-8</span>
          <span>Ln {doc.stats.lines}</span>
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
