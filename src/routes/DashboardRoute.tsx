import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  FileText,
  Star,
  Sparkles,
  Clock,
  FolderOpen,
  ArrowRight,
  Trash2,
  History,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { TOOLS, TOOL_BY_ID } from '@/app/config/tools'
import { usePreferences } from '@/stores/preferences'
import { useWorkspace } from '@/stores/workspace'
import { useQueueStore } from '@/stores/queue'
import { deleteLibraryFile, getLibraryFile, listLibraryFiles } from '@/lib/storage/repo'
import { getDB, type StoredProject } from '@/lib/storage/db'
import type { LibraryFile } from '@/types/common'
import { formatBytes, formatRelativeTime } from '@/lib/utils/format'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardRoute() {
  const navigate = useNavigate()
  const openFile = useWorkspace((s) => s.openFile)
  const appendFile = useWorkspace((s) => s.appendFile)
  const loadSavedProject = useWorkspace((s) => s.loadSavedProject)
  const restoreAutosave = useWorkspace((s) => s.restoreAutosave)
  const hasAutosaveFn = useWorkspace((s) => s.hasAutosave)

  const favoriteIds = usePreferences((s) => s.favoriteTools)
  const recentToolIds = usePreferences((s) => s.recentTools)
  const toggleFavorite = usePreferences((s) => s.toggleFavorite)
  const pushRecentTool = usePreferences((s) => s.pushRecentTool)
  const jobs = useQueueStore((s) => s.jobs)

  const [recentFiles, setRecentFiles] = React.useState<LibraryFile[]>([])
  const [projects, setProjects] = React.useState<StoredProject[]>([])
  const [canRestore, setCanRestore] = React.useState(false)

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
    try {
      const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      if (pdfs.length === 0) {
        toast.info('Opening Convert Studio for non-PDF files')
        navigate('/convert')
        return
      }
      await openFile(pdfs[0])
      for (let i = 1; i < pdfs.length; i++) {
        await appendFile(pdfs[i])
      }
      toast.success(pdfs.length > 1 ? `Opened ${pdfs.length} PDFs in workspace` : `Opened ${pdfs[0].name}`)
      navigate('/workspace')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open PDF')
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

  const quickTools = TOOLS.filter((t) => t.quick)
  const aiTools = TOOLS.filter((t) => t.ai)
  const favTools = favoriteIds.map((id) => TOOL_BY_ID[id]).filter(Boolean)
  const recentTools = recentToolIds.map((id) => TOOL_BY_ID[id]).filter(Boolean)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      {/* Hero */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{getGreeting()}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Free, private PDF tools and local AI. Everything runs directly in your browser.
            </p>
          </div>
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

        <FileDropzone
          multiple
          accept=".pdf,application/pdf,image/*"
          onFiles={handleUpload}
          title="Drop PDFs or images to get started"
          description="Supports single or multiple PDFs (auto-merged in workspace), PNG, JPG, and WebP. Zero cloud uploads."
        />
      </section>

      {/* Quick Tools */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Quick Tools</h2>
          <Button variant="ghost" size="xs" onClick={() => navigate('/tools')}>
            View all tools <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {quickTools.map((tool) => {
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
                className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-secondary/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <button
                    type="button"
                    aria-label={isFav ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(tool.id)
                    }}
                    className="rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-warning focus-visible:opacity-100"
                  >
                    <Star className={isFav ? 'size-3.5 fill-warning text-warning' : 'size-3.5'} />
                  </button>
                </div>
                <div>
                  <p className="text-[13.5px] font-medium">{tool.shortName}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{tool.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Main Grid: Recent Documents + AI & Saved Projects */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Documents */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                Recent Documents
              </CardTitle>
              <CardDescription>Stored locally in IndexedDB on this browser</CardDescription>
            </div>
            {recentFiles.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => navigate('/tools?tab=recent')}>
                Manage
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {recentFiles.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                No documents opened yet. Drop a PDF above to start working.
              </div>
            ) : (
              <div className="divide-y">
                {recentFiles.map((f) => (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openRecent(f.id)}
                    onKeyDown={(e) => e.key === 'Enter' && openRecent(f.id)}
                    className="flex cursor-pointer items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40 -mx-2 rounded-md px-2"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                        {f.pageCount ? ` · ${f.pageCount} pages` : ''} · {formatRelativeTime(f.lastOpenedAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${f.name}`}
                      onClick={(e) => removeRecent(f.id, e)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: AI Tools + Saved Projects + Favorites */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Local AI Tools
              </CardTitle>
              <CardDescription>Optional open-source models, zero API keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {aiTools.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      pushRecentTool(t.id)
                      navigate(t.route)
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="size-4 text-muted-foreground" />
                Saved Projects
              </CardTitle>
              <CardDescription>Workspace snapshots with annotations</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Save a project from the PDF Workspace to resume edits anytime.
                </p>
              ) : (
                <div className="space-y-1.5">
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
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.pageCount}p</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Row: Favorites, Recently Used, Queue */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Star className="size-3.5 text-warning" /> Favorite Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {favTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pin tools to access them quickly.</p>
            ) : (
              favTools.map((t) => (
                <Button key={t.id} variant="secondary" size="xs" onClick={() => navigate(t.route)}>
                  {t.shortName}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-3.5 text-muted-foreground" /> Recently Used
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {recentTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">Your recently opened tools will appear here.</p>
            ) : (
              recentTools.map((t) => (
                <Button key={t.id} variant="outline" size="xs" onClick={() => navigate(t.route)}>
                  {t.shortName}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="size-3.5 text-muted-foreground" /> Processing Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {jobs.length === 0
                ? 'Idle — ready for batch jobs'
                : `${jobs.filter((j) => j.status === 'done').length} completed · ${jobs.filter((j) => j.status === 'running').length} running`}
            </span>
            <Badge variant="outline" className="cursor-pointer" onClick={() => navigate('/tools?tab=batch')}>
              Open Queue
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
