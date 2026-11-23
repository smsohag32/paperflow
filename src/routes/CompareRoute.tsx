import * as React from 'react'
import { GitCompareArrows, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider, SmoothSizeSlider } from '@/components/ui/slider'
import { Segmented } from '@/components/ui/radio'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { closePdf, openPdf } from '@/lib/pdf/pdfjs'
import { formatBytes } from '@/lib/utils/format'

type CompareMode = 'side-by-side' | 'overlay' | 'visual-diff'

interface TextDiffLine {
  kind: 'added' | 'removed'
  text: string
}

function computeSimpleLineDiff(aText: string, bText: string): TextDiffLine[] {
  const aLines = aText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  const bLines = bText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  const aSet = new Set(aLines)
  const bSet = new Set(bLines)
  const out: TextDiffLine[] = []
  for (const line of aLines) {
    if (!bSet.has(line)) out.push({ kind: 'removed', text: line })
  }
  for (const line of bLines) {
    if (!aSet.has(line)) out.push({ kind: 'added', text: line })
  }
  return out.slice(0, 60)
}

export default function CompareRoute() {
  const [fileA, setFileA] = React.useState<File | null>(null)
  const [fileB, setFileB] = React.useState<File | null>(null)
  const [pagesA, setPagesA] = React.useState(0)
  const [pagesB, setPagesB] = React.useState(0)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [mode, setMode] = React.useState<CompareMode>('side-by-side')
  const [zoom, setZoom] = React.useState(100)
  const [overlayPos, setOverlayPos] = React.useState(50)
  const [diffPercent, setDiffPercent] = React.useState<number | null>(null)
  const [textDiffs, setTextDiffs] = React.useState<TextDiffLine[]>([])
  const [rendering, setRendering] = React.useState(false)

  const canvasARef = React.useRef<HTMLCanvasElement>(null)
  const canvasBRef = React.useRef<HTMLCanvasElement>(null)
  const diffCanvasRef = React.useRef<HTMLCanvasElement>(null)

  const maxPages = Math.max(pagesA, pagesB, 1)

  // Render current page from both PDFs and compute visual + text diff
  React.useEffect(() => {
    if (!fileA || !fileB) return
    let cancelled = false
    setRendering(true)
    ;(async () => {
      const [pdfA, pdfB] = await Promise.all([openPdf(fileA), openPdf(fileB)])
      try {
        if (cancelled) return
        setPagesA(pdfA.numPages)
        setPagesB(pdfB.numPages)
        const targetPage = Math.max(1, pageIndex + 1)
        const scale = Math.min(2, Math.max(0.5, (zoom / 100) * 1.15))

        const renderOne = async (
          pdf: Awaited<ReturnType<typeof openPdf>>,
          pNum: number,
          canvas: HTMLCanvasElement | null,
        ) => {
          if (!canvas) return ''
          const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
          if (pNum > pdf.numPages) {
            canvas.width = 480
            canvas.height = 640
            ctx.fillStyle = '#f8fafc'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.fillStyle = '#94a3b8'
            ctx.font = '14px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('No page at this index', canvas.width / 2, canvas.height / 2)
            return ''
          }
          const page = await pdf.getPage(pNum)
          const vp = page.getViewport({ scale })
          canvas.width = Math.max(1, Math.floor(vp.width))
          canvas.height = Math.max(1, Math.floor(vp.height))
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
          const tc = await page.getTextContent()
          return tc.items
            .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : ''))
            .join('')
        }

        const [textA, textB] = await Promise.all([
          renderOne(pdfA, targetPage, canvasARef.current),
          renderOne(pdfB, targetPage, canvasBRef.current),
        ])
        if (cancelled) return
        setTextDiffs(computeSimpleLineDiff(textA, textB))

        // Pixel-level visual diff
        const cA = canvasARef.current
        const cB = canvasBRef.current
        const cD = diffCanvasRef.current
        if (cA && cB && cD && cA.width > 0 && cB.width > 0) {
          const w = Math.max(cA.width, cB.width)
          const h = Math.max(cA.height, cB.height)
          cD.width = w
          cD.height = h
          const tmpA = document.createElement('canvas')
          const tmpB = document.createElement('canvas')
          tmpA.width = tmpB.width = w
          tmpA.height = tmpB.height = h
          const aCtx = tmpA.getContext('2d', { willReadFrequently: true })!
          const bCtx = tmpB.getContext('2d', { willReadFrequently: true })!
          aCtx.fillStyle = '#ffffff'
          aCtx.fillRect(0, 0, w, h)
          aCtx.drawImage(cA, 0, 0)
          bCtx.fillStyle = '#ffffff'
          bCtx.fillRect(0, 0, w, h)
          bCtx.drawImage(cB, 0, 0)

          const dA = aCtx.getImageData(0, 0, w, h).data
          const dB = bCtx.getImageData(0, 0, w, h).data
          const outCtx = cD.getContext('2d')!
          const outImg = outCtx.createImageData(w, h)
          const out = outImg.data
          let changed = 0
          const total = w * h

          for (let i = 0; i < dA.length; i += 4) {
            const diff = Math.abs(dA[i] - dB[i]) + Math.abs(dA[i + 1] - dB[i + 1]) + Math.abs(dA[i + 2] - dB[i + 2])
            if (diff > 36) {
              changed++
              // Vivid rose highlight for changed pixels
              out[i] = 225
              out[i + 1] = 29
              out[i + 2] = 72
              out[i + 3] = 255
            } else {
              // Soft desaturated backdrop of page B
              const lum = Math.round(0.299 * dB[i] + 0.587 * dB[i + 1] + 0.114 * dB[i + 2])
              const soft = Math.min(255, Math.round(lum * 0.6 + 102))
              out[i] = soft
              out[i + 1] = soft
              out[i + 2] = soft
              out[i + 3] = 255
            }
          }
          outCtx.putImageData(outImg, 0, 0)
          tmpA.width = tmpB.width = 0
          tmpA.height = tmpB.height = 0
          setDiffPercent((changed / Math.max(1, total)) * 100)
        }
      } finally {
        await Promise.all([closePdf(pdfA), closePdf(pdfB)])
      }
    })()
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to compare PDFs'))
      .finally(() => {
        if (!cancelled) setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [fileA, fileB, pageIndex, zoom, mode])

  const resetAll = () => {
    setFileA(null)
    setFileB(null)
    setPagesA(0)
    setPagesB(0)
    setPageIndex(0)
    setDiffPercent(null)
    setTextDiffs([])
  }

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PDF Compare Studio</h1>
          <p className="text-sm text-muted-foreground">
            Compare two PDFs side-by-side, with an overlay wipe slider, pixel-level visual diff, and text diff.
          </p>
        </div>
        {(fileA || fileB) && (
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="size-3.5" /> Reset files
          </Button>
        )}
      </div>

      {/* Upload pickers */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Original PDF (A)</CardTitle>
            <CardDescription>
              {fileA ? `${fileA.name} · ${formatBytes(fileA.size)} · ${pagesA || '…'} pages` : 'Drop the baseline PDF'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileDropzone
              compact
              onFiles={(f) => {
                setFileA(f[0] ?? null)
                setPageIndex(0)
              }}
              title={fileA ? `Replace ${fileA.name}` : 'Drop Original PDF (A)'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revised PDF (B)</CardTitle>
            <CardDescription>
              {fileB ? `${fileB.name} · ${formatBytes(fileB.size)} · ${pagesB || '…'} pages` : 'Drop the updated PDF'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileDropzone
              compact
              onFiles={(f) => {
                setFileB(f[0] ?? null)
                setPageIndex(0)
              }}
              title={fileB ? `Replace ${fileB.name}` : 'Drop Revised PDF (B)'}
            />
          </CardContent>
        </Card>
      </div>

      {fileA && fileB && (
        <div className="space-y-4">
          {/* Controls bar */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs font-medium tabular-nums">
                  Page {pageIndex + 1} / {maxPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={pageIndex >= maxPages - 1}
                  onClick={() => setPageIndex((p) => Math.min(maxPages - 1, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>

                {diffPercent !== null && (
                  <Badge variant={diffPercent < 0.05 ? 'success' : 'warning'} className="ml-2">
                    {diffPercent < 0.05 ? (
                      <>
                        <CheckCircle2 className="mr-1 size-3" /> Identical
                      </>
                    ) : (
                      <>
                        <AlertCircle className="mr-1 size-3" /> {diffPercent.toFixed(2)}% visual change
                      </>
                    )}
                  </Badge>
                )}
                {rendering && <span className="text-xs text-muted-foreground">Rendering…</span>}
              </div>

              <Segmented
                size="sm"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'side-by-side', label: 'Side by Side' },
                  { value: 'overlay', label: 'Overlay Wipe' },
                  { value: 'visual-diff', label: 'Visual Diff' },
                ]}
              />

              <div className="w-44">
                <SmoothSizeSlider
                  size="sm"
                  value={zoom}
                  min={50}
                  max={180}
                  step={5}
                  resetValue={100}
                  formatValue={(v) => `${v}%`}
                  onChange={setZoom}
                />
              </div>
            </CardContent>
          </Card>

          {/* Visual comparison stage */}
          <Card>
            <CardContent className="p-4">
              {/* Keep A & B canvases mounted so diff computation always works cleanly */}
              <div
                className={
                  mode === 'side-by-side'
                    ? 'grid gap-4 md:grid-cols-2'
                    : mode === 'overlay'
                      ? 'space-y-3'
                      : 'hidden'
                }
              >
                {mode === 'side-by-side' ? (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Original (A)</p>
                      <div className="overflow-auto rounded-lg border bg-canvas p-2">
                        <canvas ref={canvasARef} className="mx-auto block max-w-full bg-white shadow-sm" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Revised (B)</p>
                      <div className="overflow-auto rounded-lg border bg-canvas p-2">
                        <canvas ref={canvasBRef} className="mx-auto block max-w-full bg-white shadow-sm" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="relative mx-auto w-fit overflow-hidden rounded-lg border bg-white shadow-sm">
                      <canvas ref={canvasBRef} className="block max-w-full" />
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary"
                        style={{ width: `${overlayPos}%` }}
                      >
                        <canvas ref={canvasARef} className="block max-w-none" />
                      </div>
                    </div>
                    <div className="mx-auto flex max-w-lg items-center gap-3 text-xs text-muted-foreground">
                      <span>Original (A)</span>
                      <Slider
                        min={0}
                        max={100}
                        value={[overlayPos]}
                        resetValue={50}
                        formatValue={(v) => `${v}%`}
                        onValueChange={([v]) => setOverlayPos(v)}
                      />
                      <span>Revised (B)</span>
                    </div>
                  </>
                )}
              </div>

              <div className={mode === 'visual-diff' ? 'space-y-2' : 'hidden'}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <GitCompareArrows className="size-3.5 text-primary" />
                    Changed pixels highlighted in red/rose
                  </span>
                  {diffPercent !== null && <span className="tabular-nums">{diffPercent.toFixed(2)}% different</span>}
                </div>
                <div className="overflow-auto rounded-lg border bg-canvas p-2">
                  <canvas ref={diffCanvasRef} className="mx-auto block max-w-full bg-white shadow-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-Page Text Diff Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Page {pageIndex + 1} Text Changes ({textDiffs.length})</CardTitle>
              <CardDescription>
                Lines added or removed between Original (A) and Revised (B) on this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {textDiffs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No selectable text differences detected on this page.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-secondary/20 p-2 font-mono text-xs scrollbar-thin">
                  {textDiffs.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.kind === 'added'
                          ? 'rounded bg-success/15 px-2 py-0.5 text-success'
                          : 'rounded bg-destructive/15 px-2 py-0.5 text-destructive'
                      }
                    >
                      <span className="mr-2 font-bold">{line.kind === 'added' ? '+' : '−'}</span>
                      {line.text}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
