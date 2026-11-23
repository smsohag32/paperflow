import * as React from 'react'
import { Wand2, Download, RotateCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import {
  applyEnhanceToCanvas,
  estimateSkewAngle,
  SCAN_PRESETS,
  type EnhanceSettings,
  type ScanPresetKey,
} from '@/lib/image/enhance'
import { closePdf, openPdf } from '@/lib/pdf/pdfjs'
import { loadPdfLib, savePdf } from '@/lib/pdf/pdflib'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { baseName } from '@/lib/utils/format'

export default function EnhanceRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [pageCount, setPageCount] = React.useState(1)
  const [previewPage, setPreviewPage] = React.useState(0)
  const [comparePos, setComparePos] = React.useState(50)
  const [exporting, setExporting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const [settings, setSettings] = React.useState<EnhanceSettings>({
    preset: 'document',
    ...SCAN_PRESETS.document.settings,
    rotation: 0,
  })

  const origCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const enhancedCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const [sourceReady, setSourceReady] = React.useState(0)

  // Load preview page into origCanvas
  React.useEffect(() => {
    if (!file) return
    let cancelled = false
    ;(async () => {
      const orig = origCanvasRef.current
      if (!orig) return
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const pdf = await openPdf(file)
        try {
          if (cancelled) return
          setPageCount(pdf.numPages)
          const p = await pdf.getPage(Math.min(previewPage + 1, pdf.numPages))
          const base = p.getViewport({ scale: 1 })
          const scale = Math.min(1.8, 720 / base.width)
          const vp = p.getViewport({ scale })
          orig.width = Math.floor(vp.width)
          orig.height = Math.floor(vp.height)
          const ctx = orig.getContext('2d', { alpha: false })!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, orig.width, orig.height)
          await p.render({ canvas: orig, canvasContext: ctx, viewport: vp }).promise
        } finally {
          await closePdf(pdf)
        }
      } else {
        setPageCount(1)
        const bmp = await createImageBitmap(file)
        const scale = Math.min(1, 760 / bmp.width)
        orig.width = Math.floor(bmp.width * scale)
        orig.height = Math.floor(bmp.height * scale)
        orig.getContext('2d')!.drawImage(bmp, 0, 0, orig.width, orig.height)
        bmp.close()
      }
      if (!cancelled) setSourceReady((n) => n + 1)
    })().catch((e) => toast.error(e instanceof Error ? e.message : 'Preview failed'))
    return () => {
      cancelled = true
    }
  }, [file, previewPage])

  // Apply enhancement live whenever settings or source change
  React.useEffect(() => {
    if (!sourceReady) return
    const orig = origCanvasRef.current
    const enh = enhancedCanvasRef.current
    if (!orig || !enh || orig.width === 0) return
    applyEnhanceToCanvas(orig, enh, settings)
  }, [sourceReady, settings])

  const applyPreset = (key: ScanPresetKey) => {
    setSettings((s) => ({ ...s, preset: key, ...SCAN_PRESETS[key].settings }))
  }

  const handleAutoDeskew = () => {
    const orig = origCanvasRef.current
    if (!orig || orig.width === 0) return
    const ctx = orig.getContext('2d', { willReadFrequently: true })!
    const angle = estimateSkewAngle(ctx.getImageData(0, 0, orig.width, orig.height))
    setSettings((s) => ({ ...s, rotation: angle }))
    toast.success(`Auto-deskew estimated ${angle.toFixed(1)}°`)
  }

  const handleExport = async () => {
    if (!file) return
    setExporting(true)
    setProgress(0.05)
    try {
      const { PDFDocument } = await loadPdfLib()
      const out = await PDFDocument.create()
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      if (isPdf) {
        const pdf = await openPdf(file)
        try {
          for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i)
            const base = p.getViewport({ scale: 1 })
            const vp = p.getViewport({ scale: 2 })
            const srcC = document.createElement('canvas')
            const dstC = document.createElement('canvas')
            srcC.width = Math.floor(vp.width)
            srcC.height = Math.floor(vp.height)
            const ctx = srcC.getContext('2d', { alpha: false })!
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, srcC.width, srcC.height)
            await p.render({ canvas: srcC, canvasContext: ctx, viewport: vp }).promise
            applyEnhanceToCanvas(srcC, dstC, settings)
            const jpgBlob = await new Promise<Blob>((res, rej) =>
              dstC.toBlob((b) => (b ? res(b) : rej(new Error('Encode failed'))), 'image/jpeg', 0.9),
            )
            srcC.width = dstC.width = 0
            srcC.height = dstC.height = 0
            const img = await out.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()))
            const outP = out.addPage([base.width, base.height])
            outP.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
            setProgress(i / pdf.numPages)
          }
        } finally {
          await closePdf(pdf)
        }
      } else {
        const bmp = await createImageBitmap(file)
        const srcC = document.createElement('canvas')
        const dstC = document.createElement('canvas')
        srcC.width = bmp.width
        srcC.height = bmp.height
        srcC.getContext('2d')!.drawImage(bmp, 0, 0)
        bmp.close()
        applyEnhanceToCanvas(srcC, dstC, settings)
        const jpgBlob = await new Promise<Blob>((res, rej) =>
          dstC.toBlob((b) => (b ? res(b) : rej(new Error('Encode failed'))), 'image/jpeg', 0.92),
        )
        const img = await out.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()))
        const outP = out.addPage([img.width, img.height])
        outP.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        srcC.width = dstC.width = 0
        setProgress(1)
      }

      const bytes = await savePdf(out)
      downloadBlob(pdfBlob(bytes), `${baseName(file.name)}-enhanced.pdf`)
      toast.success('Enhanced PDF exported')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enhancement export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scan Enhancement Studio</h1>
          <p className="text-sm text-muted-foreground">
            Deskew, clean shadows, sharpen, and optimize scanned documents and photos locally.
          </p>
        </div>
      </div>

      {!file ? (
        <FileDropzone
          accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
          onFiles={(f) => {
            setFile(f[0] ?? null)
            setPreviewPage(0)
          }}
          title="Drop a scanned PDF or document photo"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Before / After Preview */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{file.name}</CardTitle>
                <CardDescription>Drag the slider to compare original vs enhanced</CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                {pageCount > 1 && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setPreviewPage((p) => (p + 1) % pageCount)}
                  >
                    Page {previewPage + 1}/{pageCount}
                  </Button>
                )}
                <Button size="xs" variant="ghost" onClick={() => setFile(null)}>
                  Change
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border bg-canvas">
                <canvas ref={enhancedCanvasRef} className="block max-h-[520px] w-full object-contain" />
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary"
                  style={{ width: `${comparePos}%` }}
                >
                  <canvas ref={origCanvasRef} className="block max-h-[520px] w-full object-contain" />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Original</span>
                <Slider min={0} max={100} value={[comparePos]} onValueChange={([v]) => setComparePos(v)} />
                <span>Enhanced</span>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Enhancement Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(SCAN_PRESETS) as ScanPresetKey[]).map((key) => (
                  <Button
                    key={key}
                    size="xs"
                    variant={settings.preset === key ? 'default' : 'outline'}
                    onClick={() => applyPreset(key)}
                  >
                    {SCAN_PRESETS[key].label}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button size="xs" variant="secondary" className="flex-1" onClick={handleAutoDeskew}>
                  <Sparkles className="size-3.5" /> Auto-Deskew
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setSettings((s) => ({ ...s, rotation: (s.rotation + 90) % 360 }))}
                >
                  <RotateCw className="size-3.5" /> 90°
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Background cleanup ({settings.backgroundCleanup}%)</Label>
                  <Slider
                    min={0}
                    max={100}
                    value={[settings.backgroundCleanup]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, preset: 'custom', backgroundCleanup: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contrast ({settings.contrast})</Label>
                  <Slider
                    min={-40}
                    max={80}
                    value={[settings.contrast]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, preset: 'custom', contrast: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Brightness ({settings.brightness})</Label>
                  <Slider
                    min={-40}
                    max={40}
                    value={[settings.brightness]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, preset: 'custom', brightness: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sharpen ({settings.sharpen}%)</Label>
                  <Slider
                    min={0}
                    max={100}
                    value={[settings.sharpen]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, preset: 'custom', sharpen: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Denoise ({settings.denoise}%)</Label>
                  <Slider
                    min={0}
                    max={100}
                    value={[settings.denoise]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, preset: 'custom', denoise: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fine rotation ({settings.rotation.toFixed(1)}°)</Label>
                  <Slider
                    min={-15}
                    max={15}
                    step={0.5}
                    value={[Math.max(-15, Math.min(15, settings.rotation))]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, rotation: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Grayscale</Label>
                  <Switch
                    checked={settings.grayscale}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, preset: 'custom', grayscale: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Black &amp; White threshold</Label>
                  <Switch
                    checked={settings.blackAndWhite}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, preset: 'custom', blackAndWhite: v }))}
                  />
                </div>
                {settings.blackAndWhite && (
                  <Slider
                    min={70}
                    max={220}
                    value={[settings.bwThreshold]}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, bwThreshold: v }))}
                  />
                )}
              </div>

              {exporting && <Progress value={progress * 100} />}

              <Button className="w-full" disabled={exporting} onClick={handleExport}>
                <Wand2 className="size-4" />
                {exporting ? 'Enhancing all pages…' : 'Export Enhanced PDF'}
                <Download className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
