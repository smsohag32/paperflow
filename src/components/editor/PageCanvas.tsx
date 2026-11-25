import * as React from 'react'
import { Trash2, Copy, Pencil, Highlighter, Underline, Strikethrough, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Annotation, AnnotationInput, EditorTool, WorkspacePage } from '@/types/workspace'
import { renderPageToCanvas, renderTextLayer } from '@/lib/pdf/render'
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
  onAddAnnotation: (ann: AnnotationInput) => string
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>, recordHistory?: boolean) => void
  onDeleteAnnotation: (id: string) => void
  onSwitchToSelect?: () => void
  onCropChange: (crop: { x: number; y: number; w: number; h: number }) => void
  /** Optional CSS filter applied smoothly to the rendered PDF page (e.g. Dark Reader / Invert / Sepia) */
  canvasFilter?: string
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
  onSwitchToSelect,
  onCropChange,
  canvasFilter,
}: PageCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const textLayerRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const selectingTextRef = React.useRef(false)
  const [rendering, setRendering] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [textSelection, setTextSelection] = React.useState<{
    text: string
    x: number
    y: number
    rects: { x: number; y: number; w: number; h: number }[]
  } | null>(null)

  React.useEffect(() => {
    if (editingId && editingId !== selectedAnnotationId) setEditingId(null)
  }, [selectedAnnotationId, editingId])

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

  // Render PDF.js native selectable text layer aligned with the rendered canvas
  React.useEffect(() => {
    const layer = textLayerRef.current
    if (!layer) return
    if (!page.sourceId) {
      layer.replaceChildren()
      return
    }
    const ac = new AbortController()
    renderTextLayer(page.sourceId, page.sourcePageIndex, layer, {
      scale: zoom,
      rotation: page.rotation,
      signal: ac.signal,
    }).catch(() => {})
    return () => {
      ac.abort()
      layer.replaceChildren()
    }
  }, [page.sourceId, page.sourcePageIndex, page.rotation, zoom])

  // Clear floating text selection bar when switching away from Select tool
  React.useEffect(() => {
    if (tool !== 'select') setTextSelection(null)
  }, [tool])

  // Capture text selection inside this page's text layer (mouse drag or touch hold)
  const updateSelectionBar = React.useCallback(() => {
    if (tool !== 'select') {
      setTextSelection(null)
      return
    }
    const sel = window.getSelection()
    const layer = textLayerRef.current
    const box = containerRef.current
    if (!sel || sel.isCollapsed || !layer || !box) {
      setTextSelection(null)
      return
    }
    const text = sel.toString().trim()
    if (!text) {
      setTextSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!range.intersectsNode(layer)) {
      setTextSelection(null)
      return
    }
    const boxRect = box.getBoundingClientRect()
    // Extract exact client rects from each selected text node inside this page's text layer
    // (avoids phantom container/br rects on double-click or triple-click line selections)
    const leafRects: DOMRect[] = []
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (!node.textContent || !range.intersectsNode(node)) continue
      const sub = document.createRange()
      sub.selectNodeContents(node)
      if (node === range.startContainer) sub.setStart(node, range.startOffset)
      if (node === range.endContainer) sub.setEnd(node, range.endOffset)
      for (const r of Array.from(sub.getClientRects())) {
        if (r.width > 1 && r.height > 1 && r.height < boxRect.height * 0.25) {
          leafRects.push(r)
        }
      }
    }
    const clientRects =
      leafRects.length > 0
        ? leafRects
        : Array.from(range.getClientRects()).filter(
            (r) => r.width > 1 && r.height > 1 && r.height < boxRect.height * 0.25,
          )
    if (clientRects.length === 0) {
      setTextSelection(null)
      return
    }
    const rawRects = clientRects
      .map((r) => {
        const left = Math.max(boxRect.left, r.left)
        const top = Math.max(boxRect.top, r.top)
        const right = Math.min(boxRect.right, r.right)
        const bottom = Math.min(boxRect.bottom, r.bottom)
        return {
          x: (left - boxRect.left) / boxRect.width,
          y: (top - boxRect.top) / boxRect.height,
          w: Math.max(0, (right - left) / boxRect.width),
          h: Math.max(0, (bottom - top) / boxRect.height),
        }
      })
      .filter((r) => r.w > 0.001 && r.h > 0.001)
    if (rawRects.length === 0) {
      setTextSelection(null)
      return
    }
    // Sort top-to-bottom, then left-to-right, and coalesce rects on the same text line
    rawRects.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? a.y - b.y : a.x - b.x))
    const normRects: { x: number; y: number; w: number; h: number }[] = []
    for (const r of rawRects) {
      const prev = normRects[normRects.length - 1]
      if (prev && Math.abs(prev.y - r.y) < Math.max(prev.h, r.h) * 0.6 && r.x <= prev.x + prev.w + 0.03) {
        const right = Math.max(prev.x + prev.w, r.x + r.w)
        const bottom = Math.max(prev.y + prev.h, r.y + r.h)
        prev.x = Math.min(prev.x, r.x)
        prev.y = Math.min(prev.y, r.y)
        prev.w = right - prev.x
        prev.h = bottom - prev.y
      } else {
        normRects.push({ ...r })
      }
    }
    const first = normRects[0]
    setTextSelection({
      text,
      x: Math.min(0.85, Math.max(0.15, first.x + first.w / 2)),
      y: Math.max(0.02, first.y),
      rects: normRects,
    })
  }, [tool])

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        setTextSelection(null)
        return
      }
      // Don't re-render on every mousemove while actively dragging with mouse
      if (selectingTextRef.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => updateSelectionBar(), 120)
    }
    const onGlobalPointerUp = () => {
      if (!selectingTextRef.current) return
      selectingTextRef.current = false
      textLayerRef.current?.classList.remove('selecting')
      requestAnimationFrame(() => updateSelectionBar())
    }
    document.addEventListener('selectionchange', onSelChange)
    window.addEventListener('pointerup', onGlobalPointerUp)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('selectionchange', onSelChange)
      window.removeEventListener('pointerup', onGlobalPointerUp)
    }
  }, [updateSelectionBar])

  const applySelectionMarkup = (kind: 'highlight' | 'underline' | 'strike' | 'redact') => {
    if (!textSelection) return
    for (const r of textSelection.rects) {
      if (kind === 'redact') {
        onAddAnnotation({ type: 'redact', x: r.x, y: r.y, w: r.w, h: r.h, color: '#000000' })
      } else {
        onAddAnnotation({
          type: kind,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          color: kind === 'highlight' ? '#fde047' : kind === 'underline' ? '#f59e0b' : '#ef4444',
          opacity: kind === 'highlight' ? 0.38 : 0.9,
        })
      }
    }
    window.getSelection()?.removeAllRanges()
    setTextSelection(null)
  }

  // Release GPU/RAM canvas buffer when virtualized page unmounts
  React.useEffect(() => {
    const canvas = canvasRef.current
    return () => {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [])

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
      const target = e.target as Node
      if (e.target === e.currentTarget || textLayerRef.current?.contains(target)) {
        onSelectAnnotation(null)
        setEditingId(null)
        if (tool === 'select' && textLayerRef.current?.contains(target)) {
          selectingTextRef.current = true
          setTextSelection(null)
          textLayerRef.current.classList.add('selecting')
        }
      }
      return
    }
    const pt = getNorm(e)

    if (tool === 'text') {
      const id = onAddAnnotation({
        type: 'text',
        x: Math.min(0.7, pt.x),
        y: Math.min(0.92, pt.y),
        w: 0.28,
        h: 0.06,
        text: 'Type text here',
        fontFamily: toolStyle.fontFamily,
        fontSize: toolStyle.fontSize,
        color: toolStyle.color,
        bgColor: toolStyle.bgColor,
        align: 'left',
        opacity: toolStyle.opacity,
      })
      onSwitchToSelect?.()
      setEditingId(id)
      return
    }

    if (tool === 'note') {
      const id = onAddAnnotation({
        type: 'note',
        x: Math.min(0.76, pt.x),
        y: Math.min(0.84, pt.y),
        w: 0.22,
        h: 0.14,
        text: 'Write a note…',
        color: '#fef08a',
      })
      onSwitchToSelect?.()
      setEditingId(id)
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
      onSwitchToSelect?.()
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
      onSwitchToSelect?.()
    } else if (tool === 'redact') {
      onAddAnnotation({
        type: 'redact',
        x,
        y,
        w,
        h,
        color: '#000000',
      })
      onSwitchToSelect?.()
    }
    setDraft(null)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => {
        handlePointerUp()
        if (tool === 'select' && e.button === 0) {
          requestAnimationFrame(updateSelectionBar)
        }
      }}
      style={{ width: displayW, height: displayH }}
      className={cn(
        'relative mx-auto shrink-0 bg-white page-shadow',
        tool === 'select' ? 'cursor-default select-text' : 'select-none',
        tool === 'pan' ? 'cursor-grab' : tool === 'select' ? '' : 'cursor-crosshair',
      )}
    >
      <canvas
        ref={canvasRef}
        style={canvasFilter ? { filter: canvasFilter } : undefined}
        className="pointer-events-none block size-full transition-[filter] duration-200"
      />

      {/* Native PDF.js Selectable Text Layer */}
      <div
        ref={textLayerRef}
        onDoubleClick={() => {
          if (tool === 'select') requestAnimationFrame(updateSelectionBar)
        }}
        className={cn(
          'pf-text-layer',
          tool === 'select' ? 'pointer-events-auto select-text' : 'pointer-events-none select-none',
        )}
      />

      {/* Floating quick action bar for selected PDF text */}
      {textSelection && tool === 'select' && (
        <div
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          style={{
            left: `${textSelection.x * 100}%`,
            top: `${textSelection.y * 100}%`,
          }}
          className="absolute z-30 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <button
            type="button"
            title="Copy selected text"
            onClick={() => {
              navigator.clipboard.writeText(textSelection.text).catch(() => {})
              toast.success('Copied selected text')
              window.getSelection()?.removeAllRanges()
              setTextSelection(null)
            }}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-secondary"
          >
            <Copy className="size-3.5" /> Copy
          </button>
          <button
            type="button"
            title="Highlight selection"
            onClick={() => applySelectionMarkup('highlight')}
            className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
          >
            <Highlighter className="size-3.5 text-amber-500" />
          </button>
          <button
            type="button"
            title="Underline selection"
            onClick={() => applySelectionMarkup('underline')}
            className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
          >
            <Underline className="size-3.5" />
          </button>
          <button
            type="button"
            title="Strikethrough selection"
            onClick={() => applySelectionMarkup('strike')}
            className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
          >
            <Strikethrough className="size-3.5" />
          </button>
          <button
            type="button"
            title="Permanently redact selection"
            onClick={() => applySelectionMarkup('redact')}
            className="flex size-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
          >
            <EyeOff className="size-3.5" />
          </button>
        </div>
      )}

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
        const isEditing = editingId === ann.id && (ann.type === 'text' || ann.type === 'note')
        const left = ann.type === 'line' || ann.type === 'arrow' ? Math.min(ann.x, ann.x + ann.w) : ann.x
        const top = ann.type === 'line' || ann.type === 'arrow' ? Math.min(ann.y, ann.y + ann.h) : ann.y
        const minSize =
          ann.type === 'highlight' || ann.type === 'underline' || ann.type === 'strike' || ann.type === 'redact'
            ? 0.004
            : 0.02
        const width = Math.max(minSize, Math.abs(ann.w))
        const height = Math.max(minSize, Math.abs(ann.h))

        return (
          <div
            key={ann.id}
            onPointerDown={(e) => {
              if (isEditing) {
                e.stopPropagation()
                return
              }
              if (tool !== 'select') return
              e.stopPropagation()
              window.getSelection()?.removeAllRanges()
              setTextSelection(null)
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
            onDoubleClick={(e) => {
              e.stopPropagation()
              window.getSelection()?.removeAllRanges()
              setTextSelection(null)
              onSelectAnnotation(ann.id)
              onSwitchToSelect?.()
              if (ann.type === 'text' || ann.type === 'note') {
                setEditingId(ann.id)
              }
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
              'absolute rounded-[2px] transition-[box-shadow]',
              selected || isEditing ? 'z-20' : 'z-10',
              ann.type === 'highlight' && 'mix-blend-multiply',
              tool === 'select' && !isEditing && 'cursor-move hover:ring-1 hover:ring-primary/50',
              selected && 'ring-2 ring-primary ring-offset-1',
            )}
          >
            {ann.type === 'text' &&
              (isEditing ? (
                <textarea
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={ann.text}
                  onChange={(e) => onUpdateAnnotation(ann.id, { text: e.target.value }, false)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setEditingId(null)
                    }
                  }}
                  style={{
                    color: ann.color,
                    backgroundColor: ann.bgColor && ann.bgColor !== 'transparent' ? ann.bgColor : 'rgba(255,255,255,0.92)',
                    fontSize: `${Math.max(10, ann.fontSize * zoom)}px`,
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
                  className="size-full resize-none rounded-[2px] border-0 px-1 py-0.5 leading-tight outline-none"
                />
              ) : (
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
              ))}

            {ann.type === 'highlight' && (
              <div className="size-full rounded-[2px] mix-blend-multiply" style={{ backgroundColor: ann.color }} />
            )}
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
            {ann.type === 'note' &&
              (isEditing ? (
                <textarea
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={ann.text}
                  onChange={(e) => onUpdateAnnotation(ann.id, { text: e.target.value }, false)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setEditingId(null)
                    }
                  }}
                  className="size-full resize-none rounded border border-amber-500 p-1.5 text-[11px] leading-snug text-zinc-900 outline-none"
                  style={{ backgroundColor: ann.color }}
                />
              ) : (
                <div
                  className="size-full overflow-hidden rounded border border-amber-400/70 p-1.5 text-[11px] leading-snug text-zinc-900 shadow-xs"
                  style={{ backgroundColor: ann.color }}
                >
                  {ann.text}
                </div>
              ))}
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

            {/* Floating mini action bar & resize handle when selected */}
            {selected && tool === 'select' && !isEditing && (
              <>
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute -top-8 right-0 z-20 flex items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md"
                >
                  {(ann.type === 'text' || ann.type === 'note') && (
                    <button
                      type="button"
                      title="Edit text (Double-click)"
                      aria-label="Edit text"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(ann.id)
                      }}
                      className="flex size-6 items-center justify-center rounded hover:bg-secondary"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Duplicate"
                    aria-label="Duplicate annotation"
                    onClick={(e) => {
                      e.stopPropagation()
                      const { id: _ignore, ...rest } = ann
                      onAddAnnotation({
                        ...rest,
                        x: Math.min(0.9, ann.x + 0.025),
                        y: Math.min(0.9, ann.y + 0.025),
                      } as AnnotationInput)
                    }}
                    className="flex size-6 items-center justify-center rounded hover:bg-secondary"
                  >
                    <Copy className="size-3" />
                  </button>
                  <button
                    type="button"
                    title="Delete (Del)"
                    aria-label="Delete annotation"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteAnnotation(ann.id)
                    }}
                    className="flex size-6 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <div
                  title="Drag to resize"
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
                  className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-full border-2 border-primary bg-white shadow-xs"
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
