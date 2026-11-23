import * as React from 'react'
import { Minimize2, Download, AlertTriangle, CheckCircle2, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
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
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { formatBytes, withSuffix } from '@/lib/utils/format'
import { addHistory } from '@/lib/storage/repo'

const TARGET_PRESETS = [
  { label: 'None', bytes: 0 },
  { label: '500 KB', bytes: 500 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '2 MB', bytes: 2 * 1024 * 1024 },
  { label: '5 MB', bytes: 5 * 1024 * 1024 },
]

export default function CompressRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [analysis, setAnalysis] = React.useState<CompressionAnalysis | null>(null)
  const [preset, setPreset] = React.useState<CompressionPreset>('balanced')
  const [quality, setQuality] = React.useState(72)
  const [dpi, setDpi] = React.useState(120)
  const [colorMode, setColorMode] = React.useState<ColorMode>('color')
  const [stripMetadata, setStripMetadata] = React.useState(true)
  const [targetBytes, setTargetBytes] = React.useState(0)
  const [customKB, setCustomKB] = React.useState('')

  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [status, setStatus] = React.useState('')
  const [result, setResult] = React.useState<CompressionResult | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setAnalysis(null)
    try {
      const info = await analyzeForCompression(f)
      setAnalysis(info)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not analyze PDF')
      setFile(null)
    }
  }

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
    if (!file) return
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setProgress(0.04)
    setStatus('Starting…')
    setResult(null)
    try {
      const target = customKB.trim() ? Math.max(50, Number(customKB)) * 1024 : targetBytes || undefined
      const res = await compressPdf(file, {
        preset,
        imageQuality: quality / 100,
        dpi,
        colorMode,
        stripMetadata,
        targetBytes: target,
        signal: ac.signal,
        onProgress: (p, msg) => {
          setProgress(p)
          setStatus(msg)
        },
      })
      setResult(res)
      await addHistory({
        tool: 'compress',
        title: `Compressed ${file.name} (${res.savingsPercent.toFixed(0)}% saved)`,
        inputNames: [file.name],
        outputNames: [withSuffix(file.name, '-compressed', 'pdf')],
        outputSize: res.compressedBytes,
      })
      toast.success(`Compressed to ${formatBytes(res.compressedBytes)}`)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.error(e instanceof Error ? e.message : 'Compression failed')
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compression Studio</h1>
          <p className="text-sm text-muted-foreground">
            Adaptive local PDF compression with presets or a target file size.
          </p>
        </div>
      </div>

      {!file ? (
        <FileDropzone onFiles={handleFile} title="Drop a PDF to compress" />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-primary" />
                <div>
                  <CardTitle>{file.name}</CardTitle>
                  <CardDescription>
                    Original: {formatBytes(file.size)}
                    {analysis && ` · ${analysis.pageCount} pages · ${analysis.likelyScanned ? 'Image/scan-heavy' : 'Text/vector-rich'}`}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setFile(null)}>
                Change file
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
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
                        preset === p ? 'border-primary bg-primary/5 font-medium text-primary' : 'hover:bg-secondary/50'
                      }`}
                    >
                      <span className="capitalize">{p}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target size */}
              <div className="space-y-2">
                <Label>Target size (optional — adaptive retries)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {TARGET_PRESETS.map((tp) => (
                    <Button
                      key={tp.label}
                      size="xs"
                      variant={targetBytes === tp.bytes && !customKB ? 'default' : 'outline'}
                      onClick={() => {
                        setTargetBytes(tp.bytes)
                        setCustomKB('')
                      }}
                    >
                      {tp.label}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    min={50}
                    placeholder="Custom KB"
                    value={customKB}
                    onChange={(e) => {
                      setCustomKB(e.target.value)
                      setTargetBytes(0)
                    }}
                    className="h-7 w-28 text-xs"
                  />
                </div>
              </div>

              {/* Fine Controls */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Image quality ({quality}%)</Label>
                  <Slider
                    min={30}
                    max={95}
                    value={[quality]}
                    onValueChange={([v]) => {
                      setQuality(v)
                      setPreset('custom')
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Resolution ({dpi} DPI)</Label>
                  <Slider
                    min={72}
                    max={220}
                    value={[dpi]}
                    onValueChange={([v]) => {
                      setDpi(v)
                      setPreset('custom')
                    }}
                  />
                </div>
              </div>

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
                    <span>{status}</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={progress * 100} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button disabled={running} onClick={handleCompress}>
                  <Minimize2 className="size-4" />
                  {running ? 'Compressing…' : 'Compress PDF'}
                </Button>
                {running && (
                  <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                    <X className="size-4" /> Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {result.targetReached ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <AlertTriangle className="size-5 text-warning" />
                  )}
                  Compression Result
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-secondary/50 p-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Original</p>
                    <p className="text-base font-semibold">{formatBytes(result.originalBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Compressed</p>
                    <p className="text-base font-semibold text-primary">{formatBytes(result.compressedBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saved</p>
                    <p className="text-base font-semibold text-success">
                      {result.savingsPercent.toFixed(1)}% ({formatBytes(result.savingsBytes)})
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    Strategy: {result.strategyUsed === 'lossless-structure' ? 'Lossless structure' : 'Adaptive image re-encode'}
                  </Badge>
                  <Badge variant="outline">Passes: {result.attempts}</Badge>
                </div>

                {result.qualityWarning && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>{result.qualityWarning}</span>
                  </div>
                )}

                <Button
                  onClick={() =>
                    downloadBlob(pdfBlob(result.bytes), withSuffix(file.name, '-compressed', 'pdf'))
                  }
                >
                  <Download className="size-4" /> Download Compressed PDF
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
