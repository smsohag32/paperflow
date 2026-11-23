import * as React from 'react'
import { Trash2 } from 'lucide-react'
import type { Annotation, EditorTool, WorkspacePage } from '@/types/workspace'
import { renderPageToCanvas } from '@/lib/pdf/render'
import { getAsset } from '@/lib/storage/repo'
import { cn } from '@/lib/utils/cn'

interface PageCanvasProps {
  page: WorkspacePage
  zoom: number
  tool: EditorTool
  toolStyle: {
    color: string
    bgColor: string
    strokeWidth: number
    fontSize: number
    fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier'
    opacity: number
  }
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onAddAnnotation: (ann: Omit<Annotation, 'id'>) => void
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>, recordHistory?: boolean) => void
  onDeleteAnnotation: (id: string) => void
  onCropChange: (crop: { x: number; y: number; w: number; h: number }) => void
}

/** Cache object URLs for image/signature assets so we don't re-read IDB on every render. */
function useAssetUrl(assetId?: string) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!assetId) return
    let active = true
    let created: string | null = null
    getAsset(assetId)
      .then((blob) => {
        if (!active || !blob) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => {})
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [assetId])
  return url
}

function ImageAnnOverlay({ assetId, label }: { assetId: string; label?: string }) {
  const url = useAssetUrl(assetId)
  if (!url) return <div className="size-full animate-pulse bg-secondary/60" />
  return <img src={url} alt={label ?? 'Placed image'} draggable={false} className="size-full object-contain select-none" />
}

export function PageCanvas({
  page,
  zoom,
  tool,
  toolStyle,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onCropChange,
}: PageCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [rendering, setRendering] = React.useState(false)

  // Draft gesture state (creating shapes/highlights/redactions/freehand)
  const [draft, setDraft] = React.useState<{
    startX: number
    startY: number
    curX: number
    curY: number
    points: { x: number; y: number }[]
  } | null>(null)

  // Dragging or resizing an existing annotation
  const [dragState, setDragState] = React.useState<{
    annId: string
    mode: 'move' | 'resize'
    startClientX: number
    startClientY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const swapped = page.rotation === 90 || page.rotation === 270
  const displayW = Math.round((swapped ? page.height : page.width) * zoom)
  const displayH = Math.round((swapped ? page.width : page.height) * zoom)

  // Render PDF page via shared queue
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!page.sourceId) {
      canvas.width = displayW
      canvas.height = displayH
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = page.bgColor || '#ffffff'
        ctx.fillRect(0, 0, displayW, displayH)
      }
      return
    }
    const ac = new AbortController()
    setRendering(true)
    renderPageToCanvas(page.sourceId, page.sourcePageIndex, canvas, {
      scale: zoom,
      rotation: page.rotation,
      priority: 1,
      signal: ac.signal,
    })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setRendering(false)
      })
    return () => ac.abort()
  }, [page.sourceId, page.sourcePageIndex, page.rotation, page.bgColor, zoom, displayW, displayH])

  const getNorm = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (tool === 'select' || tool === 'pan') {
      if (e.target === e.currentTarget) onSelectAnnotation(null)
      return
    }
    const pt = getNorm(e)

    if (tool === 'text') {
      onAddAnnotation({
        type: 'text',
        x: pt.x,
        y: pt.y,
        w: 0.28,
        h: 0.06,
        text: 'Double-click to edit',
        fontFamily: toolStyle.fontFamily,
        fontSize: toolStyle.fontSize,
        color: toolStyle.color,
        bgColor: toolStyle.bgColor,
        align: 'left',
        opacity: toolStyle.opacity,
      })
      return
    }

    if (tool === 'note') {
      onAddAnnotation({
        type: 'note',
        x: pt.x,
        y: pt.y,
        w: 0.22,
        h: 0.14,
        text: 'Comment note…',
        color: '#fef08a',
      })
      return
    }

    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDraft({ startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y, points: [pt] })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragState && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const dx = (e.clientX - dragState.startClientX) / rect.width
      const dy = (e.clientY - dragState.startClientY) / rect.height
      if (dragState.mode === 'move') {
        onUpdateAnnotation(
          dragState.annId,
          {
            x: Math.min(1 - dragState.origW, Math.max(0, dragState.origX + dx)),
            y: Math.min(1 - dragState.origH, Math.max(0, dragState.origY + dy)),
          },
          false,
        )
      } else {
        onUpdateAnnotation(
          dragState.annId,
          {
            w: Math.max(0.03, Math.min(1 - dragState.origX, dragState.origW + dx)),
            h: Math.max(0.02, Math.min(1 - dragState.origY, dragState.origH + dy)),
          },
          false,
        )
      }
      return
    }
    if (!draft) return
    const pt = getNorm(e)
    setDraft((d) => (d ? { ...d, curX: pt.x, curY: pt.y, points: tool === 'draw' ? [...d.points, pt] : d.points } : null))
  }

  const handlePointerUp = () => {
    if (dragState) {
      setDragState(null)
      return
    }
    if (!draft) return
    const x = Math.min(draft.startX, draft.curX)
    const y = Math.min(draft.startY, draft.curY)
    const w = Math.max(0.015, Math.abs(draft.curX - draft.startX))
    const h = Math.max(0.015, Math.abs(draft.curY - draft.startY))

    if (tool === 'crop') {
      if (w > 0.05 && h > 0.05) onCropChange({ x, y, w, h })
    } else if (tool === 'draw') {
      if (draft.points.length > 1) {
        const xs = draft.points.map((p) => p.x)
        const ys = draft.points.map((p) => p.y)
        const bx = Math.min(...xs)
        const by = Math.min(...ys)
        onAddAnnotation({
          type: 'draw',
          x: bx,
          y: by,
          w: Math.max(0.01, Math.max(...xs) - bx),
          h: Math.max(0.01, Math.max(...ys) - by),
          points: draft.points,
          stroke: toolStyle.color,
          strokeWidth: toolStyle.strokeWidth,
          opacity: toolStyle.opacity,
        })
      }
    } else if (tool === 'highlight' || tool === 'underline' || tool === 'strike') {
      onAddAnnotation({
        type: tool,
        x,
        y,
        w,
        h: tool === 'highlight' ? Math.max(0.02, h) : Math.max(0.012, h),
        color: tool === 'highlight' ? '#fde047' : tool === 'underline' ? '#f59e0b' : '#ef4444',
        opacity: tool === 'highlight' ? 0.38 : 0.9,
      })
    } else if (tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'arrow') {
      onAddAnnotation({
        type: tool,
        x: tool === 'line' || tool === 'arrow' ? draft.startX : x,
        y: tool === 'line' || tool === 'arrow' ? draft.startY : y,
        w: tool === 'line' || tool === 'arrow' ? draft.curX - draft.startX : w,
        h: tool === 'line' || tool === 'arrow' ? draft.curY - draft.startY : h,
        stroke: toolStyle.color,
        fill: toolStyle.bgColor === 'transparent' ? undefined : toolStyle.bgColor,
        strokeWidth: toolStyle.strokeWidth,
        opacity: toolStyle.opacity,
      })
    } else if (tool === 'redact') {
      onAddAnnotation({
        type: 'redact',
        x,
        y,
        w,
        h,
        color: '#000000',
      })
    }
    setDraft(null)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ width: displayW, height: displayH }}
      className={cn(
        'relative mx-auto shrink-0 bg-white page-shadow select-none',
        tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
      )}
    >
      <canvas ref={canvasRef} className="pointer-events-none block size-full" />

      {rendering && (
        <div className="pointer-events-none absolute right-2 bottom-2 rounded bg-background/85 px-2 py-0.5 text-[11px] text-muted-foreground shadow-xs">
          Rendering…
        </div>
      )}

      {/* Crop guide overlay */}
      {page.crop && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/5"
          style={{
            left: `${page.crop.x * 100}%`,
            top: `${page.crop.y * 100}%`,
            width: `${page.crop.w * 100}%`,
            height: `${page.crop.h * 100}%`,
          }}
        />
      )}

      {/* SVG layer for freehand, lines, arrows, shapes, and live drafts */}
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        {page.annotations.map((ann) => {
          if (ann.type === 'draw') {
            const pts = ann.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')
            return (
              <polyline
                key={ann.id}
                points={pts}
                fill="none"
                stroke={ann.stroke}
                strokeWidth={ann.strokeWidth * 0.35}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={ann.opacity ?? 1}
              />
            )
          }
          if (ann.type === 'line' || ann.type === 'arrow') {
            const x1 = ann.x * 100
            const y1 = ann.y * 100
            const x2 = (ann.x + ann.w) * 100
            const y2 = (ann.y + ann.h) * 100
            return (
              <g key={ann.id} opacity={ann.opacity ?? 1}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ann.stroke} strokeWidth={ann.strokeWidth * 0.35} />
              </g>
            )
          }
          return null
        })}

        {draft && tool === 'draw' && (
          <polyline
            points={draft.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="none"
            stroke={toolStyle.color}
            strokeWidth={toolStyle.strokeWidth * 0.35}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Interactive HTML overlay elements */}
      {page.annotations.map((ann) => {
        const selected = ann.id === selectedAnnotationId
        const left = ann.type === 'line' || ann.type === 'arrow' ? Math.min(ann.x, ann.x + ann.w) : ann.x
        const top = ann.type === 'line' || ann.type === 'arrow' ? Math.min(ann.y, ann.y + ann.h) : ann.y
        const width = Math.max(0.02, Math.abs(ann.w))
        const height = Math.max(0.02, Math.abs(ann.h))

        return (
          <div
            key={ann.id}
            onPointerDown={(e) => {
              if (tool !== 'select') return
              e.stopPropagation()
              onSelectAnnotation(ann.id)
              setDragState({
                annId: ann.id,
                mode: 'move',
                startClientX: e.clientX,
                startClientY: e.clientY,
                origX: ann.x,
                origY: ann.y,
                origW: ann.w,
                origH: ann.h,
              })
            }}
            style={{
              left: `${left * 100}%`,
              top: `${top * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
              transform: ann.rotation ? `rotate(${ann.rotation}deg)` : undefined,
              opacity: ann.type === 'highlight' ? (ann.opacity ?? 0.38) : (ann.opacity ?? 1),
            }}
            className={cn(
              'absolute',
              tool === 'select' && 'cursor-move',
              selected && 'ring-2 ring-primary ring-offset-1',
            )}
          >
            {ann.type === 'text' && (
              <div
                style={{
                  color: ann.color,
                  backgroundColor: ann.bgColor && ann.bgColor !== 'transparent' ? ann.bgColor : undefined,
                  fontSize: `${Math.max(8, ann.fontSize * zoom)}px`,
                  fontWeight: ann.bold ? 700 : 400,
                  fontStyle: ann.italic ? 'italic' : 'normal',
                  textDecoration: ann.underline ? 'underline' : 'none',
                  textAlign: ann.align ?? 'left',
                  fontFamily:
                    ann.fontFamily === 'TimesRoman'
                      ? 'Georgia, serif'
                      : ann.fontFamily === 'Courier'
                        ? 'monospace'
                        : 'inherit',
                }}
                className="size-full overflow-hidden leading-tight whitespace-pre-wrap px-0.5"
              >
                {ann.text}
              </div>
            )}

            {ann.type === 'highlight' && <div className="size-full rounded-[2px]" style={{ backgroundColor: ann.color }} />}
            {ann.type === 'underline' && (
              <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: ann.color }} />
            )}
            {ann.type === 'strike' && (
              <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" style={{ backgroundColor: ann.color }} />
            )}
            {ann.type === 'rect' && (
              <div
                className="size-full"
                style={{
                  border: `${Math.max(1, ann.strokeWidth * zoom)}px solid ${ann.stroke}`,
                  backgroundColor: ann.fill || 'transparent',
                }}
              />
            )}
            {ann.type === 'circle' && (
              <div
                className="size-full rounded-full"
                style={{
                  border: `${Math.max(1, ann.strokeWidth * zoom)}px solid ${ann.stroke}`,
                  backgroundColor: ann.fill || 'transparent',
                }}
              />
            )}
            {ann.type === 'note' && (
              <div
                className="size-full overflow-hidden rounded border border-amber-400/70 p-1.5 text-[11px] leading-snug text-zinc-900 shadow-xs"
                style={{ backgroundColor: ann.color }}
              >
                {ann.text}
              </div>
            )}
            {(ann.type === 'image' || ann.type === 'signature') && (
              <ImageAnnOverlay assetId={ann.assetId} label={ann.label} />
            )}
            {ann.type === 'redact' && (
              <div
                className="flex size-full items-center justify-center text-[10px] font-medium text-white/75"
                style={{ backgroundColor: ann.color || '#000000' }}
              >
                REDACTED
              </div>
            )}

            {/* Selection handles */}
            {selected && tool === 'select' && (
              <>
                <button
                  type="button"
                  aria-label="Delete annotation"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteAnnotation(ann.id)
                  }}
                  className="absolute -top-3 -right-3 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                >
                  <Trash2 className="size-3" />
                </button>
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setDragState({
                      annId: ann.id,
                      mode: 'resize',
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: ann.x,
                      origY: ann.y,
                      origW: ann.w,
                      origH: ann.h,
                    })
                  }}
                  className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-primary bg-white"
                />
              </>
            )}
          </div>
        )
      })}

      {/* Live drag preview box for rect/circle/highlight/redact/crop */}
      {draft && tool !== 'draw' && (
        <div
          className={cn(
            'pointer-events-none absolute border-2',
            tool === 'redact'
              ? 'border-black bg-black/80'
              : tool === 'highlight'
                ? 'border-yellow-400 bg-yellow-300/35'
                : 'border-dashed border-primary bg-primary/10',
          )}
          style={{
            left: `${Math.min(draft.startX, draft.curX) * 100}%`,
            top: `${Math.min(draft.startY, draft.curY) * 100}%`,
            width: `${Math.abs(draft.curX - draft.startX) * 100}%`,
            height: `${Math.abs(draft.curY - draft.startY) * 100}%`,
          }}
        />
      )}
    </div>
  )
}
