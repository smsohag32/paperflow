import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  PenTool,
  Eraser,
  Undo2,
  Trash2,
  Download,
  Save,
  Upload,
  Check,
  Info,
  Sparkles,
  FileEdit,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  deleteSignaturePreset,
  listSignaturePresets,
  processSignatureCanvas,
  saveSignaturePreset,
} from '@/lib/image/signature'
import { downloadBlob } from '@/lib/utils/download'
import { putAsset } from '@/lib/storage/repo'
import { useWorkspace } from '@/stores/workspace'
import type { StoredSignature } from '@/lib/storage/db'

const INK_COLORS = ['#0f172a', '#1d4ed8', '#1e3a8a', '#b91c1c', '#15803d']

export default function SignRoute() {
  const navigate = useNavigate()
  const doc = useWorkspace((s) => s.doc)
  const activePageId = useWorkspace((s) => s.activePageId)
  const addAnnotation = useWorkspace((s) => s.addAnnotation)

  const [tab, setTab] = React.useState<'draw' | 'upload'>('draw')
  const [inkColor, setInkColor] = React.useState('#0f172a')
  const [strokeWidth, setStrokeWidth] = React.useState(3)
  const [eraserMode, setEraserMode] = React.useState(false)
  const [sigName, setSigName] = React.useState('My Signature')
  const [sigKind, setSigKind] = React.useState<'signature' | 'initials'>('signature')

  // Drawing strokes for undo
  const drawCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const drawingRef = React.useRef(false)
  const historyRef = React.useRef<ImageData[]>([])

  // Uploaded signature background removal state
  const [uploadedBmp, setUploadedBmp] = React.useState<ImageBitmap | null>(null)
  const [threshold, setThreshold] = React.useState(210)
  const [feather, setFeather] = React.useState(32)
  const [recolor, setRecolor] = React.useState(false)
  const [comparePos, setComparePos] = React.useState(50)
  const origCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const cleanCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const uploadInputRef = React.useRef<HTMLInputElement>(null)

  const [presets, setPresets] = React.useState<StoredSignature[]>([])
  const [presetUrls, setPresetUrls] = React.useState<Record<string, string>>({})

  const loadPresets = React.useCallback(async () => {
    const list = await listSignaturePresets()
    setPresets(list)
    setPresetUrls((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
      const next: Record<string, string> = {}
      for (const p of list) next[p.id] = URL.createObjectURL(p.blob)
      return next
    })
  }, [])

  React.useEffect(() => {
    loadPresets().catch(() => {})
    return () => {
      setPresetUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
        return {}
      })
    }
  }, [loadPresets])

  // Re-render background removal preview whenever threshold/feather/ink changes
  React.useEffect(() => {
    if (!uploadedBmp) return
    const orig = origCanvasRef.current
    const clean = cleanCanvasRef.current
    if (!orig || !clean) return
    const maxW = 560
    const scale = Math.min(1, maxW / uploadedBmp.width)
    const w = Math.max(1, Math.round(uploadedBmp.width * scale))
    const h = Math.max(1, Math.round(uploadedBmp.height * scale))
    orig.width = clean.width = w
    orig.height = clean.height = h
    const octx = orig.getContext('2d')!
    octx.drawImage(uploadedBmp, 0, 0, w, h)

    processSignatureCanvas(orig, {
      threshold,
      feather,
      recolor: recolor ? inkColor : undefined,
      autoCrop: false,
    })
      .then(async ({ blob }) => {
        const bmp = await createImageBitmap(blob)
        const cctx = clean.getContext('2d')!
        cctx.clearRect(0, 0, w, h)
        cctx.drawImage(bmp, 0, 0, w, h)
        bmp.close()
      })
      .catch(() => {})
  }, [uploadedBmp, threshold, feather, recolor, inkColor])

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    }
  }

  const onDrawDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current!
    const ctx = canvas.getContext('2d')!
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 25) historyRef.current.shift()
    drawingRef.current = true
    canvas.setPointerCapture(e.pointerId)
    const pt = getCanvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = eraserMode ? 'destination-out' : 'source-over'
    ctx.strokeStyle = inkColor
    ctx.lineWidth = eraserMode ? strokeWidth * 4 : strokeWidth * (0.7 + pt.pressure * 0.8)
  }

  const onDrawMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = drawCanvasRef.current!.getContext('2d')!
    const pt = getCanvasPoint(e)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
  }

  const onDrawUp = () => {
    drawingRef.current = false
  }

  const undoDraw = () => {
    const prev = historyRef.current.pop()
    const canvas = drawCanvasRef.current
    if (prev && canvas) canvas.getContext('2d')!.putImageData(prev, 0, 0)
  }

  const clearDraw = () => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const getActiveSignatureBlob = async () => {
    if (tab === 'draw') {
      const canvas = drawCanvasRef.current
      if (!canvas) throw new Error('Draw a signature first')
      return processSignatureCanvas(canvas, { threshold: 254, feather: 1, autoCrop: true })
    }
    if (!uploadedBmp) throw new Error('Upload a signature image first')
    return processSignatureCanvas(uploadedBmp, {
      threshold,
      feather,
      recolor: recolor ? inkColor : undefined,
      autoCrop: true,
    })
  }

  const handleSavePreset = async () => {
    try {
      const { blob, width, height } = await getActiveSignatureBlob()
      await saveSignaturePreset({ name: sigName.trim() || 'Signature', kind: sigKind, blob, width, height })
      await loadPresets()
      toast.success('Saved signature locally')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save signature')
    }
  }

  const handleDownloadPng = async () => {
    try {
      const { blob } = await getActiveSignatureBlob()
      downloadBlob(blob, `${sigName.trim() || 'signature'}.png`)
      toast.success('Exported transparent PNG')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const placeInWorkspace = async (sig: StoredSignature) => {
    if (!doc || !activePageId) {
      toast.info('Open a PDF in Workspace first, then place your saved signature from the right panel.')
      navigate('/workspace')
      return
    }
    const assetId = await putAsset(sig.blob)
    const aspect = sig.width / Math.max(1, sig.height)
    addAnnotation(activePageId, {
      type: 'signature',
      assetId,
      label: sig.name,
      x: 0.35,
      y: 0.68,
      w: 0.25,
      h: Math.min(0.22, 0.25 / aspect),
      opacity: 1,
    })
    toast.success(`Placed "${sig.name}" in Workspace`)
    navigate('/workspace')
  }

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signature Studio</h1>
          <p className="text-sm text-muted-foreground">
            Draw handwritten signatures or upload a photo with automatic transparent background removal.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          PaperFlow creates <strong>visual electronic signatures</strong> (transparent handwritten/image stamps).
          They are not cryptographic X.509 certificates or verified digital identity signatures.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'draw' | 'upload')}>
              <TabsList>
                <TabsTrigger value="draw">
                  <PenTool className="size-3.5" /> Draw Signature
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Sparkles className="size-3.5" /> Upload &amp; Remove Background
                </TabsTrigger>
              </TabsList>

              <TabsContent value="draw" className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {INK_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setInkColor(c)
                          setEraserMode(false)
                        }}
                        style={{ backgroundColor: c }}
                        className={`size-6 rounded-full border-2 ${inkColor === c && !eraserMode ? 'border-primary scale-110' : 'border-transparent'}`}
                        aria-label={`Ink ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex w-32 items-center gap-2">
                    <span className="text-xs text-muted-foreground">Size</span>
                    <Slider min={1} max={10} value={[strokeWidth]} onValueChange={([v]) => setStrokeWidth(v)} />
                  </div>
                  <Button
                    size="xs"
                    variant={eraserMode ? 'default' : 'outline'}
                    onClick={() => setEraserMode((v) => !v)}
                  >
                    <Eraser className="size-3.5" /> Eraser
                  </Button>
                  <Button size="xs" variant="outline" onClick={undoDraw}>
                    <Undo2 className="size-3.5" /> Undo
                  </Button>
                  <Button size="xs" variant="ghost" onClick={clearDraw}>
                    <Trash2 className="size-3.5" /> Clear
                  </Button>
                </div>

                <div className="overflow-hidden rounded-xl border checkerboard">
                  <canvas
                    ref={drawCanvasRef}
                    width={720}
                    height={260}
                    onPointerDown={onDrawDown}
                    onPointerMove={onDrawMove}
                    onPointerUp={onDrawUp}
                    onPointerLeave={onDrawUp}
                    className="h-56 w-full touch-none cursor-crosshair"
                  />
                </div>
              </TabsContent>

              <TabsContent value="upload" className="mt-4 space-y-4">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const bmp = await createImageBitmap(f)
                    setUploadedBmp((prev) => {
                      prev?.close()
                      return bmp
                    })
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()}>
                    <Upload className="size-3.5" /> {uploadedBmp ? 'Replace image' : 'Upload signature photo'}
                  </Button>
                  {uploadedBmp && (
                    <Button
                      size="sm"
                      variant={recolor ? 'default' : 'outline'}
                      onClick={() => setRecolor((v) => !v)}
                    >
                      <Check className="size-3.5" /> Uniform ink color
                    </Button>
                  )}
                </div>

                {uploadedBmp && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Background threshold ({threshold})</Label>
                        <Slider min={100} max={248} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Edge smoothing / feather ({feather})</Label>
                        <Slider min={4} max={60} value={[feather]} onValueChange={([v]) => setFeather(v)} />
                      </div>
                    </div>

                    {/* Before / After comparison */}
                    <div className="space-y-2">
                      <div className="relative overflow-hidden rounded-xl border checkerboard">
                        <canvas ref={cleanCanvasRef} className="block max-h-60 w-full object-contain" />
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary"
                          style={{ width: `${comparePos}%` }}
                        >
                          <canvas ref={origCanvasRef} className="block max-h-60 w-full object-contain" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Before</span>
                        <Slider min={0} max={100} value={[comparePos]} onValueChange={([v]) => setComparePos(v)} />
                        <span>After (Transparent)</span>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>

          <CardContent className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label>Preset name</Label>
              <Input value={sigName} onChange={(e) => setSigName(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={sigKind === 'signature' ? 'secondary' : 'outline'}
                onClick={() => setSigKind('signature')}
              >
                Signature
              </Button>
              <Button
                size="sm"
                variant={sigKind === 'initials' ? 'secondary' : 'outline'}
                onClick={() => setSigKind('initials')}
              >
                Initials
              </Button>
            </div>
            <Button size="sm" onClick={handleSavePreset}>
              <Save className="size-3.5" /> Save Preset
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadPng}>
              <Download className="size-3.5" /> Transparent PNG
            </Button>
          </CardContent>
        </Card>

        {/* Saved Presets */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Signatures ({presets.length})</CardTitle>
            <CardDescription>Stored locally in your browser for quick placement on PDFs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {presets.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Save your drawn or cleaned signature to reuse it across any PDF.
              </p>
            ) : (
              presets.map((p) => (
                <div key={p.id} className="space-y-2 rounded-lg border p-2.5">
                  <div className="flex h-16 items-center justify-center rounded checkerboard p-1">
                    {presetUrls[p.id] && (
                      <img src={presetUrls[p.id]} alt={p.name} className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium">{p.name}</span>
                    <div className="flex items-center gap-1">
                      <Button size="xs" variant="secondary" onClick={() => placeInWorkspace(p)}>
                        <FileEdit className="size-3" /> Place
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={async () => {
                          await deleteSignaturePreset(p.id)
                          loadPresets()
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
