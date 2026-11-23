import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Star, Search, FileText, Trash2, Download, Play, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SimpleSelect } from '@/components/ui/select'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { CATEGORY_LABELS, TOOLS, type ToolCategory } from '@/app/config/tools'
import { usePreferences } from '@/stores/preferences'
import { useQueueStore } from '@/stores/queue'
import { useWorkspace } from '@/stores/workspace'
import { deleteLibraryFile, getLibraryFile, listLibraryFiles } from '@/lib/storage/repo'
import { compressPdf, COMPRESSION_PRESETS } from '@/lib/pdf/compress'
import { stripMetadata } from '@/lib/security/security'
import { downloadBlob, downloadOutputs, pdfBlob } from '@/lib/utils/download'
import { formatBytes, formatRelativeTime, withSuffix } from '@/lib/utils/format'
import type { LibraryFile } from '@/types/common'

export default function ToolsRoute() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') || 'all'

  const favoriteIds = usePreferences((s) => s.favoriteTools)
  const toggleFavorite = usePreferences((s) => s.toggleFavorite)
  const pushRecentTool = usePreferences((s) => s.pushRecentTool)
  const openFile = useWorkspace((s) => s.openFile)

  const jobs = useQueueStore((s) => s.jobs)
  const enqueue = useQueueStore((s) => s.enqueue)

  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<'all' | ToolCategory>('all')
  const [recentFiles, setRecentFiles] = React.useState<LibraryFile[]>([])

  // Batch processing state
  const [batchFiles, setBatchFiles] = React.useState<File[]>([])
  const [batchAction, setBatchAction] = React.useState<'compress' | 'strip-meta' | 'rename'>('compress')
  const [batchPrefix, setBatchPrefix] = React.useState('processed-')

  React.useEffect(() => {
    listLibraryFiles(50).then(setRecentFiles).catch(() => {})
  }, [activeTab])

  const filteredTools = TOOLS.filter((t) => {
    if (activeTab === 'favorites' && !favoriteIds.includes(t.id)) return false
    if (category !== 'all' && t.category !== category) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.includes(q))
    )
  })

  const runBatch = () => {
    if (batchFiles.length === 0) return
    for (const file of batchFiles) {
      enqueue(
        {
          tool: `batch-${batchAction}`,
          title: `${batchAction === 'compress' ? 'Compress' : batchAction === 'strip-meta' ? 'Clean metadata' : 'Rename'}: ${file.name}`,
          fileName: file.name,
        },
        async ({ signal, setProgress }) => {
          if (batchAction === 'compress') {
            const res = await compressPdf(file, {
              preset: 'balanced',
              ...COMPRESSION_PRESETS.balanced,
              signal,
              onProgress: (p, status) => setProgress(p, status),
            })
            return { name: withSuffix(file.name, '-compressed', 'pdf'), blob: pdfBlob(res.bytes) }
          }
          if (batchAction === 'strip-meta') {
            setProgress(0.4, 'Removing metadata…')
            const bytes = await stripMetadata(file)
            setProgress(1, 'Done')
            return { name: withSuffix(file.name, '-clean', 'pdf'), blob: pdfBlob(bytes) }
          }
          setProgress(1, 'Renamed')
          return { name: `${batchPrefix}${file.name}`, blob: file }
        },
      )
    }
    toast.success(`Queued ${batchFiles.length} files for local batch processing`)
    setBatchFiles([])
  }

  const completedOutputs = jobs.filter((j) => j.status === 'done' && j.output).map((j) => j.output!)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tools &amp; Library</h1>
        <p className="text-sm text-muted-foreground">
          Browse every local PDF tool, manage recent files, or run batch operations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setParams(v === 'all' ? {} : { tab: v })}>
        <TabsList>
          <TabsTrigger value="all">All Tools</TabsTrigger>
          <TabsTrigger value="favorites">Favorites ({favoriteIds.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent Files ({recentFiles.length})</TabsTrigger>
          <TabsTrigger value="batch">Batch &amp; Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tools by name or capability…"
                className="pl-9"
              />
            </div>
            <SimpleSelect
              className="w-48"
              value={category}
              onValueChange={(v) => setCategory(v as 'all' | ToolCategory)}
              options={[
                { value: 'all', label: 'All categories' },
                ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k as ToolCategory, label: v })),
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTools.map((tool) => {
              const Icon = tool.icon
              const isFav = favoriteIds.includes(tool.id)
              return (
                <Card
                  key={tool.id}
                  onClick={() => {
                    pushRecentTool(tool.id)
                    navigate(tool.route)
                  }}
                  className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-secondary/20"
                >
                  <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(tool.id)
                      }}
                    >
                      <Star className={isFav ? 'size-4 fill-warning text-warning' : 'size-4 text-muted-foreground'} />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[14.5px]">{tool.name}</p>
                      {tool.ai && <Badge variant="primary">Local AI</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="favorites" className="mt-5">
          {filteredTools.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No favorite tools yet. Click the star on any tool to pin it here.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTools.map((tool) => {
                const Icon = tool.icon
                return (
                  <Card
                    key={tool.id}
                    onClick={() => navigate(tool.route)}
                    className="cursor-pointer transition-colors hover:border-primary/40"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="size-4 text-primary" /> {tool.name}
                      </CardTitle>
                      <CardDescription>{tool.description}</CardDescription>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Recent Local Files</CardTitle>
              <CardDescription>Saved inside your browser&apos;s IndexedDB for instant reopening.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentFiles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No recent files stored locally.</p>
              ) : (
                <div className="divide-y">
                  {recentFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const found = await getLibraryFile(f.id)
                          if (found) {
                            await openFile(found.file, { existingSourceId: f.id })
                            navigate('/workspace')
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left hover:underline"
                      >
                        <FileText className="size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{f.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(f.size)} · {formatRelativeTime(f.lastOpenedAt)}
                          </p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={async () => {
                          await deleteLibraryFile(f.id)
                          setRecentFiles((prev) => prev.filter((x) => x.id !== f.id))
                        }}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch" className="mt-5 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4 text-primary" /> Batch Processor
              </CardTitle>
              <CardDescription>
                Process multiple PDFs with bounded concurrency so low-end devices stay responsive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone
                compact
                multiple
                onFiles={(files) => setBatchFiles((prev) => [...prev, ...files])}
                title="Add PDFs to batch"
                description="Select multiple PDFs to queue together"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Batch action</Label>
                  <SimpleSelect
                    value={batchAction}
                    onValueChange={(v) => setBatchAction(v as typeof batchAction)}
                    options={[
                      { value: 'compress', label: 'Compress (Balanced preset)' },
                      { value: 'strip-meta', label: 'Remove metadata (Privacy clean)' },
                      { value: 'rename', label: 'Batch rename with prefix' },
                    ]}
                  />
                </div>
                {batchAction === 'rename' && (
                  <div className="space-y-1.5">
                    <Label>Filename prefix</Label>
                    <Input value={batchPrefix} onChange={(e) => setBatchPrefix(e.target.value)} />
                  </div>
                )}
              </div>
              {batchFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{batchFiles.length} file(s) ready</span>
                    <Button variant="ghost" size="xs" onClick={() => setBatchFiles([])}>
                      Clear list
                    </Button>
                  </div>
                  <Button onClick={runBatch}>
                    <Play className="size-3.5" /> Start Batch ({batchFiles.length} files)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {jobs.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Queue Results ({jobs.length})</CardTitle>
                {completedOutputs.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadOutputs(completedOutputs, 'paperflow-batch.zip')}
                  >
                    <Download className="size-3.5" /> Download All ({completedOutputs.length})
                  </Button>
                )}
              </CardHeader>
              <CardContent className="divide-y">
                {jobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{j.title}</p>
                      <p className="text-xs text-muted-foreground">{j.detail || j.status}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          j.status === 'done' ? 'success' : j.status === 'error' ? 'destructive' : 'secondary'
                        }
                      >
                        {j.status}
                      </Badge>
                      {j.output && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => downloadBlob(j.output!.blob, j.output!.name)}
                        >
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
