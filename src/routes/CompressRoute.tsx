import * as React from 'react'
import {
  Minimize2,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileText,
  X,
  Plus,
  Eye,
  Trash2,
  Archive,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Slider, SmoothSizeSlider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/radio'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import {
  analyzeForCompression,
  compressPdf,
  COMPRESSION_PRESETS,
  type ColorMode,
  type CompressionAnalysis,
  type CompressionPreset,
  type CompressionResult,
} from '@/lib/pdf/compress'
import { closePdf, openPdf } from '@/lib/pdf/pdfjs'
import { downloadBlob, downloadOutputs, pdfBlob } from '@/lib/utils/download'
import { formatBytes, withSuffix } from '@/lib/utils/format'
import { addHistory } from '@/lib/storage/repo'

interface BatchItem {
  id: string
  file: File
  analysis: CompressionAnalysis | null
  result: CompressionResult | null
  error?: string
}

function estimateOutputBytes(
  originalBytes: number,
  quality: number,
  dpi: number,
  colorMode: ColorMode,
  targetEnabled: boolean,
  targetBytes: number,
): number {
  if (originalBytes <= 0) return 0
  const qualityFactor = 0.22 + (quality / 100) * 0.72
  const dpiFactor = Math.min(1.15, Math.pow(dpi / 150, 1.35))
  const colorFactor = colorMode === 'bw' ? 0.45 : colorMode === 'grayscale' ? 0.76 : 1
  const rawEstimate = Math.round(originalBytes * Math.min(0.98, Math.max(0.08, qualityFactor * dpiFactor * colorFactor)))
  if (targetEnabled && targetBytes > 0) {
    return Math.min(originalBytes, Math.max(25 * 1024, targetBytes))
  }
  return Math.max(25 * 1024, rawEstimate)
}

export default function CompressRoute() {
  const [items, setItems] = React.useState<BatchItem[]>([])
  const [preset, setPreset] = React.useState<CompressionPreset>('balanced')
  const [quality, setQuality] = React.useState(72)
  const [dpi, setDpi] = React.useState(120)
  const [colorMode, setColorMode] = React.useState<ColorMode>('color')
  const [stripMetadata, setStripMetadata] = React.useState(true)

  // Smooth target size slider state
  const [targetEnabled, setTargetEnabled] = React.useState(false)
  const [targetBytes, setTargetBytes] = React.useState(1024 * 1024)
  const [customKB, setCustomKB] = React.useState('')

  // Live visual quality preview (Page 1 Before/After)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [comparePos, setComparePos] = React.useState(50)
  const origCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const compCanvasRef = React.useRef<HTMLCanvasElement>(null)

  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [status, setStatus] = React.useState('')
  const abortRef = React.useRef<AbortController | null>(null)
  const addMoreRef = React.useRef<HTMLInputElement>(null)

  const primaryItem = items[0] ?? null
  const totalOriginalBytes = items.reduce((sum, it) => sum + it.file.size, 0)
  const maxTargetBytes = Math.max(100 * 1024, primaryItem?.file.size ?? 10 * 1024 * 1024)
  const minTargetBytes = Math.min(50 * 1024, Math.max(15 * 1024, Math.round(maxTargetBytes * 0.05)))

  const handleFiles = async (files: File[], append = false) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) {
      toast.error('Please select one or more PDF files')
      return
    }
    const newEntries: BatchItem[] = pdfs.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      analysis: null,
      result: null,
    }))
    setItems((prev) => (append ? [...prev, ...newEntries] : newEntries))
    setPreviewOpen(false)

    // Default target slider to ~50% of first file size
    if (!append && pdfs[0]) {
      const half = Math.max(50 * 1024, Math.round((pdfs[0].size * 0.5) / 1024) * 1024)
      setTargetBytes(half)
      setCustomKB('')
    }

    // Analyze each PDF asynchronously
    for (const entry of newEntries) {
      analyzeForCompression(entry.file)
        .then((info) => {
          setItems((prev) => prev.map((it) => (it.id === entry.id ? { ...it, analysis: info } : it)))
        })
        .catch((e) => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === entry.id
                ? { ...it, error: e instanceof Error ? e.message : 'Could not analyze PDF' }
                : it,
            ),
          )
        })
    }
  }

  // Render Page 1 before/after visual quality preview when previewOpen is toggled on
  React.useEffect(() => {
    if (!previewOpen || !primaryItem) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const pdf = await openPdf(primaryItem.file)
        try {
          if (cancelled) return
          const page = await pdf.getPage(1)
          const baseVp = page.getViewport({ scale: 1 })
          const displayScale = Math.min(1.5, 620 / baseVp.width)
          const origVp = page.getViewport({ scale: displayScale })
          const origCanvas = origCanvasRef.current
          const compCanvas = compCanvasRef.current
          if (!origCanvas || !compCanvas) return

          origCanvas.width = Math.max(1, Math.floor(origVp.width))
          origCanvas.height = Math.max(1, Math.floor(origVp.height))
          const octx = origCanvas.getContext('2d', { alpha: false })!
          octx.fillStyle = '#ffffff'
          octx.fillRect(0, 0, origCanvas.width, origCanvas.height)
          await page.render({ canvas: origCanvas, canvasContext: octx, viewport: origVp }).promise

          // Render simulated compressed canvas at target DPI + JPEG quality + color mode
          const simScale = Math.min(displayScale, dpi / 72)
          const simVp = page.getViewport({ scale: simScale })
          const tmp = document.createElement('canvas')
          tmp.width = Math.max(1, Math.floor(simVp.width))
          tmp.height = Math.max(1, Math.floor(simVp.height))
          const tctx = tmp.getContext('2d', { alpha: false, willReadFrequently: colorMode !== 'color' })!
          tctx.fillStyle = '#ffffff'
          tctx.fillRect(0, 0, tmp.width, tmp.height)
          await page.render({ canvas: tmp, canvasContext: tctx, viewport: simVp }).promise

          if (colorMode !== 'color') {
            const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height)
            const d = imgData.data
            const bw = colorMode === 'bw'
            for (let i = 0; i < d.length; i += 4) {
              const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
              const v = bw ? (lum > 175 ? 255 : 0) : lum
              d[i] = d[i + 1] = d[i + 2] = v
            }
            tctx.putImageData(imgData, 0, 0)
          }

          const blob = await new Promise<Blob | null>((res) => tmp.toBlob(res, 'image/jpeg', quality / 100))
          tmp.width = tmp.height = 0
          if (!blob || cancelled) return
          const bmp = await createImageBitmap(blob)
          compCanvas.width = origCanvas.width
          compCanvas.height = origCanvas.height
          const cctx = compCanvas.getContext('2d', { alpha: false })!
          cctx.imageSmoothingEnabled = true
          cctx.drawImage(bmp, 0, 0, compCanvas.width, compCanvas.height)
          bmp.close()
        } finally {
          await closePdf(pdf)
        }
      } catch {
        // Silent fallback if preview cannot render
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewOpen, primaryItem, dpi, quality, colorMode])

  const selectPreset = (p: CompressionPreset) => {
    setPreset(p)
    if (p !== 'custom') {
      const cfg = COMPRESSION_PRESETS[p]
      setQuality(Math.round(cfg.imageQuality * 100))
      setDpi(cfg.dpi)
      setColorMode(cfg.colorMode)
      setStripMetadata(cfg.stripMetadata)
    }
  }

  const handleCompress = async () => {
    if (items.length === 0) return
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setProgress(0.03)
    setStatus('Starting…')
    setItems((prev) => prev.map((it) => ({ ...it, result: null, error: undefined })))

    try {
      const effectiveTarget = targetEnabled
        ? customKB.trim()
          ? Math.max(25, Number(customKB)) * 1024
          : targetBytes
        : undefined

      let totalSaved = 0
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const base = idx / items.length
        const span = 1 / items.length
        const res = await compressPdf(item.file, {
          preset,
          imageQuality: quality / 100,
          dpi,
          colorMode,
          stripMetadata,
          targetBytes: effectiveTarget,
          signal: ac.signal,
          onProgress: (p, msg) => {
            setProgress(base + p * span)
            setStatus(items.length > 1 ? `[${idx + 1}/${items.length}] ${item.file.name}: ${msg}` : msg)
          },
        })
        totalSaved += res.savingsBytes
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, result: res } : it)))
        await addHistory({
          tool: 'compress',
          title: `Compressed ${item.file.name} (${res.savingsPercent.toFixed(0)}% saved)`,
          inputNames: [item.file.name],
          outputNames: [withSuffix(item.file.name, '-compressed', 'pdf')],
          outputSize: res.compressedBytes,
        })
      }
      toast.success(
        items.length > 1
          ? `Compressed ${items.length} PDFs (saved ${formatBytes(totalSaved)})`
          : `Compressed successfully (saved ${formatBytes(totalSaved)})`,
      )
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.error(e instanceof Error ? e.message : 'Compression failed')
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const completedItems = items.filter((it) => it.result)
  const totalCompressedBytes = completedItems.reduce((sum, it) => sum + (it.result?.compressedBytes ?? 0), 0)
  const totalSavingsBytes = Math.max(0, totalOriginalBytes - totalCompressedBytes)
  const totalSavingsPct = totalOriginalBytes > 0 ? (totalSavingsBytes / totalOriginalBytes) * 100 : 0

  const estimatedBytes = primaryItem
    ? estimateOutputBytes(primaryItem.file.size, quality, dpi, colorMode, targetEnabled, targetBytes)
    : 0
  const estimatedSavingsPct =
    primaryItem && primaryItem.file.size > 0
      ? Math.max(0, Math.round(((primaryItem.file.size - estimatedBytes) / primaryItem.file.size) * 100))
      : 0

  const targetPresets = React.useMemo(() => {
    if (!primaryItem) return []
    const orig = primaryItem.file.size
    const candidates = [
      { label: '25%', value: Math.max(minTargetBytes, Math.round((orig * 0.25) / 1024) * 1024) },
      { label: '50%', value: Math.max(minTargetBytes, Math.round((orig * 0.5) / 1024) * 1024) },
      { label: '75%', value: Math.max(minTargetBytes, Math.round((orig * 0.75) / 1024) * 1024) },
      { label: '500 KB', value: 500 * 1024 },
      { label: '1 MB', value: 1024 * 1024 },
      { label: '2 MB', value: 2 * 1024 * 1024 },
      { label: '5 MB', value: 5 * 1024 * 1024 },
    ]
    return candidates.filter((c) => c.value >= minTargetBytes && c.value < orig)
  }, [primaryItem, minTargetBytes])

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compression Studio</h1>
          <p className="text-sm text-muted-foreground">
            Smooth target-size compression, live quality preview, and batch PDF optimization — 100% local.
          </p>
        </div>
      </div>

      <input
        ref={addMoreRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : []
          if (list.length) handleFiles(list, true)
          e.target.value = ''
        }}
      />

      {items.length === 0 ? (
        <FileDropzone
          multiple
          onFiles={(files) => handleFiles(files, false)}
          title="Drop one or multiple PDFs to compress"
          description="Supports single-file quality preview or batch compression with ZIP export"
        />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-primary" />
                <div>
                  <CardTitle>
                    {items.length === 1 ? primaryItem.file.name : `${items.length} PDFs queued`}
                  </CardTitle>
                  <CardDescription>
                    Total: {formatBytes(totalOriginalBytes)}
                    {items.length === 1 &&
                      primaryItem.analysis &&
                      ` · ${primaryItem.analysis.pageCount} pages · ${
                        primaryItem.analysis.likelyScanned ? 'Image/scan-heavy' : 'Text/vector-rich'
                      }`}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="xs" onClick={() => addMoreRef.current?.click()}>
                  <Plus className="size-3.5" /> Add PDFs
                </Button>
                <Button
                  variant={previewOpen ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => setPreviewOpen((v) => !v)}
                >
                  <Eye className="size-3.5" /> {previewOpen ? 'Hide Preview' : 'Quality Preview'}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setItems([])}>
                  Clear
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Batch file list when > 1 file */}
              {items.length > 1 && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border bg-secondary/25 p-2 scrollbar-thin">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{it.file.name}</span>
                      <span className="text-muted-foreground tabular-nums">{formatBytes(it.file.size)}</span>
                      {it.result && (
                        <Badge variant="success">
                          {formatBytes(it.result.compressedBytes)} (-{it.result.savingsPercent.toFixed(0)}%)
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${it.file.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Presets */}
              <div className="space-y-2">
                <Label>Compression preset</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(['light', 'balanced', 'strong', 'maximum', 'custom'] as CompressionPreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => selectPreset(p)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        preset === p
                          ? 'border-primary bg-primary/8 font-medium text-primary'
                          : 'hover:bg-secondary/50'
                      }`}
                    >
                      <div className="capitalize">{p}</div>
                      {p !== 'custom' && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {COMPRESSION_PRESETS[p].dpi} DPI · {Math.round(COMPRESSION_PRESETS[p].imageQuality * 100)}%
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smooth Target File Size Slider */}
              <div className="space-y-3 rounded-xl border bg-secondary/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={targetEnabled}
                      onCheckedChange={(v) => {
                        setTargetEnabled(v)
                        if (v && primaryItem && targetBytes >= primaryItem.file.size) {
                          setTargetBytes(Math.max(minTargetBytes, Math.round(primaryItem.file.size * 0.5)))
                        }
                      }}
                      id="target-size-toggle"
                    />
                    <Label htmlFor="target-size-toggle" className="cursor-pointer font-medium">
                      Target File Size (adaptive multi-pass)
                    </Label>
                  </div>
                  {targetEnabled && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={25}
                        placeholder="Custom KB"
                        value={customKB}
                        onChange={(e) => {
                          setCustomKB(e.target.value)
                          const kb = Number(e.target.value)
                          if (Number.isFinite(kb) && kb >= 25) {
                            setTargetBytes(Math.min(maxTargetBytes, kb * 1024))
                          }
                        }}
                        className="h-7 w-28 text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground">KB</span>
                    </div>
                  )}
                </div>

                {targetEnabled && (
                  <SmoothSizeSlider
                    label="Desired maximum size"
                    value={Math.min(maxTargetBytes, Math.max(minTargetBytes, targetBytes))}
                    min={minTargetBytes}
                    max={maxTargetBytes}
                    step={5 * 1024}
                    scale="log"
                    showSteppers
                    formatValue={(b) => formatBytes(b)}
                    hint={
                      primaryItem && primaryItem.file.size > 0
                        ? `~${Math.max(0, Math.round(((primaryItem.file.size - targetBytes) / primaryItem.file.size) * 100))}% smaller`
                        : undefined
                    }
                    resetValue={Math.max(minTargetBytes, Math.round(maxTargetBytes * 0.5))}
                    presets={targetPresets}
                    onChange={(bytes) => {
                      setTargetBytes(bytes)
                      setCustomKB('')
                    }}
                  />
                )}
              </div>

              {/* Fine Controls with Smooth Sliders */}
              <div className="grid gap-5 sm:grid-cols-2">
                <SmoothSizeSlider
                  label="Image quality"
                  value={quality}
                  min={30}
                  max={95}
                  step={1}
                  showSteppers
                  stepperStep={5}
                  resetValue={72}
                  formatValue={(v) => `${v}%`}
                  marks={[
                    { value: 45, label: 'Compact' },
                    { value: 72, label: 'Balanced' },
                    { value: 90, label: 'Crisp' },
                  ]}
                  onChange={(v) => {
                    setQuality(v)
                    setPreset('custom')
                  }}
                />
                <SmoothSizeSlider
                  label="Resolution"
                  value={dpi}
                  min={72}
                  max={220}
                  step={2}
                  showSteppers
                  stepperStep={10}
                  resetValue={120}
                  formatValue={(v) => `${v} DPI`}
                  marks={[
                    { value: 72, label: '72' },
                    { value: 120, label: '120' },
                    { value: 150, label: '150' },
                    { value: 220, label: '220' },
                  ]}
                  onChange={(v) => {
                    setDpi(v)
                    setPreset('custom')
                  }}
                />
              </div>

              {/* Live Estimated Output Bar */}
              {primaryItem && (
                <div className="space-y-1.5 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      Estimated size {items.length > 1 ? '(first file)' : ''}
                    </span>
                    <span className="tabular-nums">
                      <span className="text-muted-foreground line-through">
                        {formatBytes(primaryItem.file.size)}
                      </span>{' '}
                      → <strong className="text-primary">~{formatBytes(estimatedBytes)}</strong>{' '}
                      <span className="text-success">(-{estimatedSavingsPct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                      style={{
                        width: `${Math.max(4, Math.min(100, (estimatedBytes / Math.max(1, primaryItem.file.size)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Optional Live Visual Quality Preview (Page 1 Before/After) */}
              {previewOpen && primaryItem && (
                <div className="space-y-2.5 rounded-xl border bg-canvas p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      Page 1 Visual Preview ({dpi} DPI · {quality}% · {colorMode})
                    </span>
                    {previewLoading && <span className="text-muted-foreground">Rendering…</span>}
                  </div>
                  <div className="relative mx-auto max-w-xl overflow-hidden rounded-lg border bg-white">
                    <canvas ref={compCanvasRef} className="block max-h-[360px] w-full object-contain" />
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary"
                      style={{ width: `${comparePos}%` }}
                    >
                      <canvas ref={origCanvasRef} className="block max-h-[360px] w-full object-contain" />
                    </div>
                  </div>
                  <div className="mx-auto flex max-w-xl items-center gap-3 text-xs text-muted-foreground">
                    <span>Original</span>
                    <Slider
                      min={0}
                      max={100}
                      value={[comparePos]}
                      formatValue={(v) => `${v}%`}
                      resetValue={50}
                      onValueChange={([v]) => setComparePos(v)}
                    />
                    <span>Compressed</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>Color mode</Label>
                  <Segmented
                    size="sm"
                    value={colorMode}
                    onValueChange={(v) => {
                      setColorMode(v)
                      setPreset('custom')
                    }}
                    options={[
                      { value: 'color', label: 'Color' },
                      { value: 'grayscale', label: 'Grayscale' },
                      { value: 'bw', label: 'Black & White' },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={stripMetadata} onCheckedChange={setStripMetadata} id="strip-meta" />
                  <Label htmlFor="strip-meta">Clean document metadata</Label>
                </div>
              </div>

              {running && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{status}</span>
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={progress * 100} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button disabled={running} onClick={handleCompress}>
                  <Minimize2 className="size-4" />
                  {running
                    ? 'Compressing…'
                    : items.length > 1
                      ? `Compress ${items.length} PDFs`
                      : 'Compress PDF'}
                </Button>
                {running && (
                  <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                    <X className="size-4" /> Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compression Results */}
          {completedItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {completedItems.every((it) => it.result?.targetReached) ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <AlertTriangle className="size-5 text-warning" />
                  )}
                  Compression Result{completedItems.length > 1 ? `s (${completedItems.length} files)` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-secondary/50 p-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Original</p>
                    <p className="text-base font-semibold tabular-nums">{formatBytes(totalOriginalBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Compressed</p>
                    <p className="text-base font-semibold text-primary tabular-nums">
                      {formatBytes(totalCompressedBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saved</p>
                    <p className="text-base font-semibold text-success tabular-nums">
                      {totalSavingsPct.toFixed(1)}% ({formatBytes(totalSavingsBytes)})
                    </p>
                  </div>
                </div>

                {completedItems.length === 1 && completedItems[0].result && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        Strategy:{' '}
                        {completedItems[0].result.strategyUsed === 'lossless-structure'
                          ? 'Lossless structure'
                          : 'Adaptive image re-encode'}
                      </Badge>
                      <Badge variant="outline">Passes: {completedItems[0].result.attempts}</Badge>
                    </div>

                    {completedItems[0].result.qualityWarning && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                        <span>{completedItems[0].result.qualityWarning}</span>
                      </div>
                    )}

                    <Button
                      onClick={() =>
                        downloadBlob(
                          pdfBlob(completedItems[0].result!.bytes),
                          withSuffix(completedItems[0].file.name, '-compressed', 'pdf'),
                        )
                      }
                    >
                      <Download className="size-4" /> Download Compressed PDF
                    </Button>
                  </>
                )}

                {completedItems.length > 1 && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      {completedItems.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{it.file.name}</p>
                            <p className="text-muted-foreground tabular-nums">
                              {formatBytes(it.result!.originalBytes)} → {formatBytes(it.result!.compressedBytes)} (
                              {it.result!.savingsPercent.toFixed(1)}% saved)
                            </p>
                          </div>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              downloadBlob(
                                pdfBlob(it.result!.bytes),
                                withSuffix(it.file.name, '-compressed', 'pdf'),
                              )
                            }
                          >
                            <Download className="size-3.5" /> PDF
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={() =>
                        downloadOutputs(
                          completedItems.map((it) => ({
                            name: withSuffix(it.file.name, '-compressed', 'pdf'),
                            blob: pdfBlob(it.result!.bytes),
                          })),
                          'compressed-pdfs.zip',
                        )
                      }
                    >
                      <Archive className="size-4" /> Download All as ZIP
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
