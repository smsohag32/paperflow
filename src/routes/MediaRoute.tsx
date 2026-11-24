import * as React from 'react'
import {
  Images,
  Download,
  Archive,
  Trash2,
  Replace,
  RotateCcw,
  Maximize2,
  Check,
  Copy,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  X,
  ArrowUpDown,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { SmoothSizeSlider } from '@/components/ui/slider'
import { Segmented } from '@/components/ui/radio'
import { Badge } from '@/components/ui/misc'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDropzone } from '@/components/upload/FileDropzone'
import {
  applyPdfImageEdits,
  convertImageBlob,
  extractPdfImages,
  type ExtractedPdfImage,
  type ImageExportFormat,
} from '@/lib/pdf/media'
import { downloadBlob, downloadOutputs, pdfBlob } from '@/lib/utils/download'
import { baseName, formatBytes, withSuffix } from '@/lib/utils/format'
import { addHistory } from '@/lib/storage/repo'
import { cn } from '@/lib/utils/cn'

type SortKey = 'page' | 'resolution' | 'size'

interface PendingReplacement {
  file: File
  previewUrl: string
  bytes: Uint8Array
}

export default function MediaRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [pageCount, setPageCount] = React.useState(0)
  const [images, setImages] = React.useState<ExtractedPdfImage[]>([])
  const [scanning, setScanning] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [status, setStatus] = React.useState('')

  // Gallery filters & smooth card-size slider
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [pageFilter, setPageFilter] = React.useState<string>('all')
  const [hideTiny, setHideTiny] = React.useState(true)
  const [sortBy, setSortBy] = React.useState<SortKey>('page')
  const [cardSize, setCardSize] = React.useState(230)

  // Export format & quality
  const [exportFormat, setExportFormat] = React.useState<ImageExportFormat>('original')
  const [exportQuality, setExportQuality] = React.useState(90)
  const [exportingZip, setExportingZip] = React.useState(false)

  // PDF image edit state (remove / replace in-place)
  const [removedRefKeys, setRemovedRefKeys] = React.useState<Set<string>>(new Set())
  const [replacements, setReplacements] = React.useState<Record<string, PendingReplacement>>({})
  const [savingPdf, setSavingPdf] = React.useState(false)

  // Lightbox preview
  const [lightboxId, setLightboxId] = React.useState<string | null>(null)

  const replaceTargetRef = React.useRef<string | null>(null)
  const replaceInputRef = React.useRef<HTMLInputElement>(null)

  // Cleanup object URLs on unmount or file change
  const cleanupUrls = React.useCallback((imgs: ExtractedPdfImage[], reps: Record<string, PendingReplacement>) => {
    imgs.forEach((im) => im.previewUrl && URL.revokeObjectURL(im.previewUrl))
    Object.values(reps).forEach((r) => r.previewUrl && URL.revokeObjectURL(r.previewUrl))
  }, [])

  React.useEffect(() => {
    return () => cleanupUrls(images, replacements)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    cleanupUrls(images, replacements)
    setFile(f)
    setImages([])
    setSelectedIds(new Set())
    setRemovedRefKeys(new Set())
    setReplacements({})
    setPageFilter('all')
    setLightboxId(null)
    setScanning(true)
    setProgress(0.05)
    setStatus('Scanning PDF for embedded images…')

    try {
      const res = await extractPdfImages(f, {
        onProgress: (p, msg) => {
          setProgress(p)
          setStatus(msg)
        },
      })
      setPageCount(res.pageCount)
      setImages(res.images)
      if (res.images.length === 0) {
        toast.info('No embedded raster images found in this PDF (it may be pure vector/text).')
      } else {
        toast.success(`Extracted ${res.images.length} embedded image(s)`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to extract images from PDF')
      setFile(null)
    } finally {
      setScanning(false)
    }
  }

  const visibleImages = React.useMemo(() => {
    const list = images.filter((im) => {
      if (hideTiny && im.width < 64 && im.height < 64) return false
      if (pageFilter !== 'all' && !im.pages.includes(Number(pageFilter))) return false
      return true
    })
    return [...list].sort((a, b) => {
      if (sortBy === 'resolution') return b.width * b.height - a.width * a.height
      if (sortBy === 'size') return b.bytes - a.bytes
      return (a.pages[0] ?? 0) - (b.pages[0] ?? 0) || b.width * b.height - a.width * a.height
    })
  }, [images, hideTiny, pageFilter, sortBy])

  const totalMediaBytes = images.reduce((sum, im) => sum + im.bytes, 0)
  const pendingEditCount = removedRefKeys.size + Object.keys(replacements).length

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    if (selectedIds.size === visibleImages.length && visibleImages.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleImages.map((i) => i.id)))
    }
  }

  const handleDownloadSingle = async (img: ExtractedPdfImage, idx: number) => {
    try {
      const { blob, ext } = await convertImageBlob(img, exportFormat, exportQuality / 100)
      const prefix = file ? baseName(file.name) : 'pdf'
      downloadBlob(blob, `${prefix}-p${img.pages[0] ?? 1}-img${idx + 1}.${ext}`)
      toast.success(`Downloaded image (${img.width}×${img.height})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const handleDownloadZip = async () => {
    const targets = selectedIds.size > 0 ? visibleImages.filter((im) => selectedIds.has(im.id)) : visibleImages
    if (targets.length === 0) return
    setExportingZip(true)
    try {
      const prefix = file ? baseName(file.name) : 'pdf'
      const outputs: { name: string; blob: Blob }[] = []
      for (let i = 0; i < targets.length; i++) {
        const img = targets[i]
        const { blob, ext } = await convertImageBlob(img, exportFormat, exportQuality / 100)
        outputs.push({
          name: `${prefix}-p${img.pages[0] ?? 1}-img${String(i + 1).padStart(2, '0')}.${ext}`,
          blob,
        })
      }
      await downloadOutputs(outputs, `${prefix}-images.zip`)
      await addHistory({
        tool: 'media',
        title: `Extracted ${outputs.length} image(s) from ${file?.name ?? 'PDF'}`,
        inputNames: file ? [file.name] : [],
        outputNames: [`${prefix}-images.zip`],
        outputSize: outputs.reduce((s, o) => s + o.blob.size, 0),
      })
      toast.success(`Exported ${outputs.length} image(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ZIP export failed')
    } finally {
      setExportingZip(false)
    }
  }

  const toggleRemoveImage = (refKey?: string) => {
    if (!refKey) {
      toast.info('This inline image cannot be removed individually.')
      return
    }
    setRemovedRefKeys((prev) => {
      const next = new Set(prev)
      if (next.has(refKey)) next.delete(refKey)
      else next.add(refKey)
      return next
    })
  }

  const triggerReplaceImage = (refKey?: string) => {
    if (!refKey) {
      toast.info('This inline image cannot be replaced individually.')
      return
    }
    replaceTargetRef.current = refKey
    replaceInputRef.current?.click()
  }

  const handleReplaceFileChosen = async (newFile: File) => {
    const refKey = replaceTargetRef.current
    if (!refKey) return
    try {
      const bytes = new Uint8Array(await newFile.arrayBuffer())
      const previewUrl = URL.createObjectURL(newFile)
      setReplacements((prev) => {
        if (prev[refKey]?.previewUrl) URL.revokeObjectURL(prev[refKey].previewUrl)
        return { ...prev, [refKey]: { file: newFile, previewUrl, bytes } }
      })
      // If it was previously marked removed, unmark removal
      setRemovedRefKeys((prev) => {
        const next = new Set(prev)
        next.delete(refKey)
        return next
      })
      toast.success(`Replacement queued: ${newFile.name}`)
    } catch {
      toast.error('Could not read replacement image')
    }
  }

  const handleMarkAllRemoved = () => {
    const removable = images.map((im) => im.refKey).filter(Boolean) as string[]
    if (removable.length === 0) return
    setRemovedRefKeys(new Set(removable))
    toast.info(`Marked ${removable.length} image(s) for removal — click "Export Modified PDF" to save.`)
  }

  const handleExportModifiedPdf = async () => {
    if (!file || pendingEditCount === 0) return
    setSavingPdf(true)
    try {
      const repPayload: Record<string, { bytes: Uint8Array; mimeType: string }> = {}
      for (const [k, v] of Object.entries(replacements)) {
        repPayload[k] = { bytes: v.bytes, mimeType: v.file.type || 'image/png' }
      }
      const outBytes = await applyPdfImageEdits(file, {
        removeRefKeys: Array.from(removedRefKeys),
        replacements: repPayload,
      })
      const outName = withSuffix(file.name, '-media-edited', 'pdf')
      downloadBlob(pdfBlob(outBytes), outName)
      await addHistory({
        tool: 'media',
        title: `Edited media in ${file.name} (${removedRefKeys.size} removed, ${Object.keys(replacements).length} replaced)`,
        inputNames: [file.name],
        outputNames: [outName],
        outputSize: outBytes.byteLength,
      })
      toast.success(`Saved ${outName} (${formatBytes(outBytes.byteLength)})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not export modified PDF')
    } finally {
      setSavingPdf(false)
    }
  }

  const handleCopyImage = async (img: ExtractedPdfImage) => {
    try {
      const { blob } = await convertImageBlob(img, 'png')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('Image copied to clipboard')
    } catch {
      toast.error('Clipboard image copy is not supported in this browser')
    }
  }

  const lightboxIndex = lightboxId ? visibleImages.findIndex((i) => i.id === lightboxId) : -1
  const lightboxImg = lightboxIndex >= 0 ? visibleImages[lightboxIndex] : null

  return (
    <div className="w-full space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleReplaceFileChosen(f)
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">PDF Media &amp; Image Extractor</h1>
            <Badge variant="primary">Original Quality</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Extract every embedded photo, diagram, and chart from a PDF, download as ZIP, or remove/replace images in-place.
          </p>
        </div>

        {file && (
          <div className="flex flex-wrap items-center gap-2">
            {pendingEditCount > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRemovedRefKeys(new Set())
                    Object.values(replacements).forEach((r) => URL.revokeObjectURL(r.previewUrl))
                    setReplacements({})
                  }}
                >
                  <RotateCcw className="size-3.5" /> Undo Edits
                </Button>
                <Button size="sm" variant="secondary" disabled={savingPdf} onClick={handleExportModifiedPdf}>
                  <FileDown className="size-3.5" />
                  {savingPdf ? 'Saving PDF…' : `Export Modified PDF (${pendingEditCount})`}
                </Button>
              </>
            )}
            <Button
              size="sm"
              disabled={exportingZip || visibleImages.length === 0}
              onClick={handleDownloadZip}
            >
              <Archive className="size-3.5" />
              {exportingZip
                ? 'Packaging…'
                : selectedIds.size > 0
                  ? `Download Selected (${selectedIds.size}) ZIP`
                  : `Download All (${visibleImages.length}) ZIP`}
            </Button>
          </div>
        )}
      </div>

      {!file ? (
        <FileDropzone
          onFiles={handleFile}
          title="Drop a PDF to extract all embedded images"
          description="Extracts original JPEGs untouched and decodes PNG/Flate graphics at full native resolution — 100% locally"
        />
      ) : (
        <div className="space-y-4">
          {/* File Summary & Controls Card */}
          <Card className="overflow-hidden border-border/80 shadow-xs">
            <CardContent className="p-0">
              {/* Top File Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/20 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{file.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                      <span className="rounded-md bg-card px-1.5 py-0.5 font-medium ring-1 ring-border/70">
                        {formatBytes(file.size)}
                      </span>
                      <span className="rounded-md bg-card px-1.5 py-0.5 font-medium ring-1 ring-border/70">
                        {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                      </span>
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                        {images.length} {images.length === 1 ? 'image' : 'images'} · {formatBytes(totalMediaBytes)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {images.length > 0 && (
                    <Button variant="outline" size="xs" onClick={handleMarkAllRemoved}>
                      <Trash2 className="size-3.5 text-destructive" /> Remove All Images
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      cleanupUrls(images, replacements)
                      setFile(null)
                      setImages([])
                      setRemovedRefKeys(new Set())
                      setReplacements({})
                    }}
                  >
                    Change PDF
                  </Button>
                </div>
              </div>

              {scanning && (
                <div className="space-y-1.5 border-t px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{status}</span>
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={progress * 100} />
                </div>
              )}

              {!scanning && images.length > 0 && (
                <div className="flex flex-col gap-3 border-t px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left Group: Selection, Page Filter, Sort & Tiny Filter */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant={selectedIds.size > 0 ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={selectAllVisible}
                    >
                      <Check className="size-3.5" />
                      {selectedIds.size === visibleImages.length && visibleImages.length > 0
                        ? 'Deselect All'
                        : `Select All (${visibleImages.length})`}
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Filter className="size-3.5 text-muted-foreground" />
                      <SimpleSelect
                        size="sm"
                        ariaLabel="Filter by page"
                        className="min-w-[128px]"
                        value={pageFilter}
                        onValueChange={setPageFilter}
                        options={[
                          { value: 'all', label: 'All pages' },
                          ...Array.from({ length: pageCount }, (_, i) => ({
                            value: String(i + 1),
                            label: `Page ${i + 1}`,
                          })),
                        ]}
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <ArrowUpDown className="size-3.5 text-muted-foreground" />
                      <SimpleSelect
                        size="sm"
                        ariaLabel="Sort images"
                        className="min-w-[164px]"
                        value={sortBy}
                        onValueChange={(v) => setSortBy(v as SortKey)}
                        options={[
                          { value: 'page', label: 'Page order' },
                          { value: 'resolution', label: 'Largest resolution' },
                          { value: 'size', label: 'Largest file size' },
                        ]}
                      />
                    </div>

                    <label
                      htmlFor="hide-tiny"
                      className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border/80 bg-secondary/25 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                    >
                      <Switch id="hide-tiny" checked={hideTiny} onCheckedChange={setHideTiny} />
                      <span>Hide icons (&lt;64px)</span>
                    </label>
                  </div>

                  {/* Right Group: Export Format Pills, Quality & Smooth Card Size Slider */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] font-medium text-muted-foreground">Export</Label>
                      <Segmented<ImageExportFormat>
                        size="sm"
                        value={exportFormat}
                        onValueChange={setExportFormat}
                        options={[
                          { value: 'original', label: 'Original' },
                          { value: 'png', label: 'PNG' },
                          { value: 'jpeg', label: 'JPG' },
                          { value: 'webp', label: 'WebP' },
                        ]}
                      />
                    </div>

                    {(exportFormat === 'jpeg' || exportFormat === 'webp') && (
                      <div className="w-36">
                        <SmoothSizeSlider
                          size="sm"
                          label="Quality"
                          value={exportQuality}
                          min={50}
                          max={100}
                          step={5}
                          resetValue={90}
                          formatValue={(v) => `${v}%`}
                          onChange={setExportQuality}
                        />
                      </div>
                    )}

                    <div className="w-44">
                      <SmoothSizeSlider
                        size="sm"
                        label="Card size"
                        value={cardSize}
                        min={160}
                        max={340}
                        step={10}
                        resetValue={230}
                        formatValue={(v) => `${v}px`}
                        onChange={setCardSize}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Media Gallery */}
          {!scanning && visibleImages.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Images className="size-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  {images.length === 0 ? 'No embedded images in this PDF' : 'No images match the current filter'}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {images.length === 0
                    ? 'This PDF appears to contain only vector graphics or text. You can still convert pages to images in Convert Studio.'
                    : 'Try turning off "Hide tiny icons" or switching back to "All pages".'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
              }}
            >
              {visibleImages.map((img, idx) => {
                const selected = selectedIds.has(img.id)
                const isRemoved = !!(img.refKey && removedRefKeys.has(img.refKey))
                const replacement = img.refKey ? replacements[img.refKey] : undefined

                return (
                  <div
                    key={img.id}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg',
                      selected && 'border-primary ring-2 ring-primary/25',
                      isRemoved && 'opacity-65',
                    )}
                  >
                    {/* Thumbnail Preview Stage */}
                    <div
                      onClick={() => setLightboxId(img.id)}
                      className={cn(
                        'relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden p-3',
                        img.format === 'png' ? 'checkerboard' : 'bg-secondary/35',
                      )}
                    >
                      <img
                        src={replacement ? replacement.previewUrl : img.previewUrl}
                        alt={`Page ${img.pages[0] ?? 1} image ${idx + 1}`}
                        className="max-h-full max-w-full rounded-md object-contain shadow-xs transition-transform duration-200 group-hover:scale-[1.04]"
                        loading="lazy"
                      />

                      {/* Selection Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(img.id)
                        }}
                        aria-label={`Select image ${idx + 1}`}
                        className={cn(
                          'absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-lg border shadow-sm transition-all',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-white/70 bg-black/45 text-white opacity-0 backdrop-blur-xs group-hover:opacity-100',
                        )}
                      >
                        <Check className="size-3.5" />
                      </button>

                      {/* Format & Resolution Glass Pill */}
                      <div className="pointer-events-none absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white shadow-xs backdrop-blur-md">
                        <span className="font-bold uppercase">{img.format === 'jpeg' ? 'JPG' : 'PNG'}</span>
                        <span className="opacity-50">·</span>
                        <span className="tabular-nums">
                          {img.width}×{img.height}
                        </span>
                      </div>

                      {/* Removed / Replaced Overlay */}
                      {isRemoved && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-destructive/75 p-2 text-white backdrop-blur-[1px]">
                          <span className="text-xs font-bold tracking-wide uppercase">Marked for Removal</span>
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleRemoveImage(img.refKey)
                            }}
                          >
                            <RotateCcw className="size-3" /> Undo
                          </Button>
                        </div>
                      )}
                      {replacement && !isRemoved && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
                          <Sparkles className="size-3" /> Replaced
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!img.refKey) return
                              setReplacements((prev) => {
                                const next = { ...prev }
                                if (next[img.refKey!]?.previewUrl) URL.revokeObjectURL(next[img.refKey!].previewUrl)
                                delete next[img.refKey!]
                                return next
                              })
                            }}
                            className="ml-1 hover:opacity-80"
                            title="Undo replacement"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between gap-2 border-t px-2.5 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-medium tabular-nums">
                          {img.pages.length === 1
                            ? `Page ${img.pages[0]}`
                            : `Pages ${img.pages.slice(0, 3).join(', ')}${img.pages.length > 3 ? '…' : ''}`}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(img.bytes)}</div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Full preview"
                          onClick={() => setLightboxId(img.id)}
                        >
                          <Maximize2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Download image"
                          onClick={() => handleDownloadSingle(img, idx)}
                        >
                          <Download className="size-3.5" />
                        </Button>
                        {img.refKey && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Replace image in PDF"
                              onClick={() => triggerReplaceImage(img.refKey)}
                            >
                              <Replace className="size-3.5 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title={isRemoved ? 'Restore image' : 'Remove image from PDF'}
                              onClick={() => toggleRemoveImage(img.refKey)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      <Dialog open={!!lightboxImg} onOpenChange={(open) => !open && setLightboxId(null)}>
        <DialogContent className="max-w-3xl">
          {lightboxImg && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6 text-sm">
                  <span>
                    Page {lightboxImg.pages.join(', ')} · {lightboxImg.width} × {lightboxImg.height}px ·{' '}
                    {formatBytes(lightboxImg.bytes)}
                  </span>
                  <Badge variant="outline" className="uppercase">
                    {lightboxImg.format}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="relative flex max-h-[62vh] items-center justify-center overflow-auto rounded-lg border checkerboard p-4">
                <img
                  src={
                    (lightboxImg.refKey && replacements[lightboxImg.refKey]?.previewUrl) || lightboxImg.previewUrl
                  }
                  alt="Full resolution preview"
                  className="max-h-[56vh] max-w-full object-contain"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={lightboxIndex <= 0}
                    onClick={() => setLightboxId(visibleImages[lightboxIndex - 1]?.id ?? null)}
                  >
                    <ChevronLeft className="size-3.5" /> Prev
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {lightboxIndex + 1} / {visibleImages.length}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={lightboxIndex >= visibleImages.length - 1}
                    onClick={() => setLightboxId(visibleImages[lightboxIndex + 1]?.id ?? null)}
                  >
                    Next <ChevronRight className="size-3.5" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="xs" onClick={() => handleCopyImage(lightboxImg)}>
                    <Copy className="size-3.5" /> Copy
                  </Button>
                  {lightboxImg.refKey && (
                    <Button variant="outline" size="xs" onClick={() => triggerReplaceImage(lightboxImg.refKey)}>
                      <Replace className="size-3.5" /> Replace in PDF
                    </Button>
                  )}
                  <Button size="xs" onClick={() => handleDownloadSingle(lightboxImg, lightboxIndex)}>
                    <Download className="size-3.5" /> Download
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
