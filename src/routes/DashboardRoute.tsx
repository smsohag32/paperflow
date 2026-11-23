import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  FileText,
  Star,
  Clock,
  FolderOpen,
  ArrowUpRight,
  Trash2,
  History,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TOOLS, type ToolCategory } from '@/app/config/tools'
import { usePreferences } from '@/stores/preferences'
import { useWorkspace } from '@/stores/workspace'
import { deleteLibraryFile, getLibraryFile, listLibraryFiles } from '@/lib/storage/repo'
import { getDB, type StoredProject } from '@/lib/storage/db'
import type { LibraryFile } from '@/types/common'
import { formatBytes, formatRelativeTime } from '@/lib/utils/format'
import { ACCEPTED_UNIVERSAL_FILES, ensurePdfFile } from '@/lib/pdf/convert'
import { cn } from '@/lib/utils/cn'

type FilterTab = 'all' | 'pinned' | 'edit' | 'organize' | 'convert' | 'ai' | 'security'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Tools' },
  { id: 'edit', label: 'Edit & Docs' },
  { id: 'organize', label: 'Organize' },
  { id: 'convert', label: 'Convert & Scan' },
  { id: 'ai', label: 'Local AI' },
  { id: 'security', label: 'Security' },
]

const ICON_ACCENT: Record<ToolCategory, string> = {
  edit: 'bg-indigo-500/12 text-indigo-500 dark:bg-indigo-400/15 dark:text-indigo-400',
  organize: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400',
  optimize: 'bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
  convert: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400',
  scan: 'bg-teal-500/12 text-teal-600 dark:bg-teal-400/15 dark:text-teal-400',
  ai: 'bg-violet-500/12 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400',
  security: 'bg-rose-500/12 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400',
}

// 12 core tools -> balanced 4x3 grid on desktop (zero orphan cards)
const DASHBOARD_TOOLS = TOOLS.filter((t) => t.id !== 'batch')

export default function DashboardRoute() {
  const navigate = useNavigate()
  const openFile = useWorkspace((s) => s.openFile)
  const appendFile = useWorkspace((s) => s.appendFile)
  const loadSavedProject = useWorkspace((s) => s.loadSavedProject)
  const restoreAutosave = useWorkspace((s) => s.restoreAutosave)
  const hasAutosaveFn = useWorkspace((s) => s.hasAutosave)

  const favoriteIds = usePreferences((s) => s.favoriteTools)
  const toggleFavorite = usePreferences((s) => s.toggleFavorite)
  const pushRecentTool = usePreferences((s) => s.pushRecentTool)

  const [recentFiles, setRecentFiles] = React.useState<LibraryFile[]>([])
  const [projects, setProjects] = React.useState<StoredProject[]>([])
  const [canRestore, setCanRestore] = React.useState(false)
  const [activeFilter, setActiveFilter] = React.useState<FilterTab>('all')
  const [activityTab, setActivityTab] = React.useState<'recent' | 'projects'>('recent')
  const [dragging, setDragging] = React.useState(false)
  const uploadInputRef = React.useRef<HTMLInputElement>(null)

  const refresh = React.useCallback(async () => {
    const [files, db, auto] = await Promise.all([
      listLibraryFiles(8),
      getDB(),
      hasAutosaveFn(),
    ])
    setRecentFiles(files)
    const projs = await db.getAllFromIndex('projects', 'byUpdated')
    setProjects(projs.reverse().slice(0, 6))
    setCanRestore(auto)
  }, [hasAutosaveFn])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      const prepared = await Promise.all(files.map((f) => ensurePdfFile(f)))
      await openFile(prepared[0].file)
      for (let i = 1; i < prepared.length; i++) {
        await appendFile(prepared[i].file)
      }
      const convertedCount = prepared.filter((p) => p.converted).length
      if (prepared.length > 1) {
        toast.success(
          convertedCount > 0
            ? `Converted & opened ${prepared.length} files in Workspace`
            : `Opened ${prepared.length} PDFs in Workspace`,
        )
      } else if (prepared[0].converted) {
        toast.success(`Converted ${files[0].name} to PDF & opened in Workspace`)
      } else {
        toast.success(`Opened ${files[0].name}`)
      }
      navigate('/workspace')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open file')
    }
  }

  const openRecent = async (id: string) => {
    try {
      const found = await getLibraryFile(id)
      if (!found) {
        toast.error('File not found in local storage.')
        refresh()
        return
      }
      await openFile(found.file, { existingSourceId: id })
      navigate('/workspace')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open file')
    }
  }

  const removeRecent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteLibraryFile(id)
    setRecentFiles((prev) => prev.filter((f) => f.id !== id))
    toast.success('Removed from local storage')
  }

  const filteredTools = React.useMemo(() => {
    switch (activeFilter) {
      case 'pinned':
        return DASHBOARD_TOOLS.filter((t) => favoriteIds.includes(t.id))
      case 'edit':
        return DASHBOARD_TOOLS.filter((t) => t.category === 'edit')
      case 'organize':
        return DASHBOARD_TOOLS.filter((t) => t.category === 'organize' || t.category === 'optimize')
      case 'convert':
        return DASHBOARD_TOOLS.filter((t) => t.category === 'convert' || t.category === 'scan')
      case 'ai':
        return DASHBOARD_TOOLS.filter((t) => t.category === 'ai')
      case 'security':
        return DASHBOARD_TOOLS.filter((t) => t.category === 'security')
      default:
        return DASHBOARD_TOOLS
    }
  }, [activeFilter, favoriteIds])

  return (
    <div className="w-full space-y-6 px-4 py-5 md:px-6 lg:px-8">
      {/* Drag & Drop Upload Box */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop or browse files to open in Workspace"
        onClick={() => uploadInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            uploadInputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const files = Array.from(e.dataTransfer.files)
          if (files.length) handleUpload(files)
        }}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-all duration-150',
          dragging
            ? 'border-primary bg-primary/8'
            : 'border-border/90 bg-card/70 hover:border-primary/50 hover:bg-card',
        )}
      >
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept={ACCEPTED_UNIVERSAL_FILES}
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : []
            if (list.length) handleUpload(list)
            e.target.value = ''
          }}
        />

        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary transition-transform duration-150 group-hover:scale-105">
          <Upload className="size-5" />
        </div>

        <div className="space-y-1">
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            Drop files here to open in Workspace
          </p>
          <p className="text-xs text-muted-foreground">
            Supports PDF, Markdown (.md), Word (.docx), HTML, Text &amp; Images (PNG, JPG, WebP)
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => uploadInputRef.current?.click()}>
            Browse Files
          </Button>
          {canRestore && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const ok = await restoreAutosave()
                if (ok) navigate('/workspace')
                else toast.error('Could not restore previous session')
              }}
            >
              <History className="size-3.5" />
              Resume last workspace
            </Button>
          )}
        </div>
      </div>

      {/* Tools Grid with Category Filter Tabs */}
      <section className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {FILTER_TABS.map((tab) => {
              const active = activeFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
            {favoriteIds.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter('pinned')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeFilter === 'pinned'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                )}
              >
                <Star className="size-3 fill-current" /> Pinned ({favoriteIds.length})
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{filteredTools.length} tools</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTools.map((tool) => {
            const Icon = tool.icon
            const isFav = favoriteIds.includes(tool.id)
            return (
              <div
                key={tool.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  pushRecentTool(tool.id)
                  navigate(tool.route)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pushRecentTool(tool.id)
                    navigate(tool.route)
                  }
                }}
                className="group relative flex cursor-pointer flex-col justify-between gap-3 rounded-xl border border-border/80 bg-card/85 p-4 transition-all duration-150 hover:-translate-y-[1px] hover:border-primary/45 hover:bg-card hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105',
                      ICON_ACCENT[tool.category],
                    )}
                  >
                    <Icon className="size-4.5" />
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={isFav ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(tool.id)
                      }}
                      className={cn(
                        'rounded p-1 transition-opacity hover:text-warning focus-visible:opacity-100',
                        isFav
                          ? 'opacity-100 text-warning'
                          : 'opacity-0 text-muted-foreground/60 group-hover:opacity-100',
                      )}
                    >
                      <Star className={isFav ? 'size-3.5 fill-warning text-warning' : 'size-3.5'} />
                    </button>
                    <ArrowUpRight className="size-3.5 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13.5px] font-semibold tracking-tight text-foreground">{tool.name}</p>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Clean Single Recent Activity Panel (Documents + Saved Projects tabs) */}
      <section className="rounded-xl border border-border/80 bg-card/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActivityTab('recent')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activityTab === 'recent'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Clock className="size-3.5" />
              Recent Documents
              {recentFiles.length > 0 && (
                <span className="rounded bg-background/80 px-1.5 py-0.2 text-[10.5px] text-muted-foreground">
                  {recentFiles.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActivityTab('projects')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activityTab === 'projects'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FolderOpen className="size-3.5" />
              Saved Projects
              {projects.length > 0 && (
                <span className="rounded bg-background/80 px-1.5 py-0.2 text-[10.5px] text-muted-foreground">
                  {projects.length}
                </span>
              )}
            </button>
          </div>

          {activityTab === 'recent' && recentFiles.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => navigate('/tools?tab=recent')}>
              Manage all
            </Button>
          )}
        </div>

        <div className="p-2">
          {activityTab === 'recent' ? (
            recentFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No recent documents yet. Drop a file above to get started — stored privately in your browser.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentFiles.map((f) => (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openRecent(f.id)}
                    onKeyDown={(e) => e.key === 'Enter' && openRecent(f.id)}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{f.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {formatBytes(f.size)}
                        {f.pageCount ? ` · ${f.pageCount} pages` : ''} · {formatRelativeTime(f.lastOpenedAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${f.name}`}
                      className="opacity-60 group-hover:opacity-100"
                      onClick={(e) => removeRecent(f.id, e)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : projects.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Save a snapshot from the PDF Workspace to resume your annotations anytime.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await loadSavedProject(p.id)
                      navigate('/workspace')
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Failed to load project')
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-secondary/50"
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.pageCount} pages</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
