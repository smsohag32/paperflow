import * as React from 'react'
import { loadThumbnail } from '@/lib/pdf/render'
import { useProfile } from '@/lib/performance/profile'
import { cn } from '@/lib/utils/cn'

interface PageThumbnailProps {
  sourceId: string | null
  sourcePageIndex: number
  rotation?: number
  bgColor?: string
  priority?: number
  canvasFilter?: string
  className?: string
}

/**
 * On-demand PDF thumbnail renderer.
 * Uses IntersectionObserver so only visible thumbnails request renders from the shared LRU queue.
 */
export const PageThumbnail = React.memo(function PageThumbnail({
  sourceId,
  sourcePageIndex,
  rotation = 0,
  bgColor = '#ffffff',
  priority = 20,
  canvasFilter,
  className,
}: PageThumbnailProps) {
  const profile = useProfile()
  const hostRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    const el = hostRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  React.useEffect(() => {
    if (!visible || !sourceId) return
    const ac = new AbortController()
    setLoaded(false)
    loadThumbnail(sourceId, sourcePageIndex, profile.thumbWidth, {
      priority,
      signal: ac.signal,
    })
      .then((bmp) => {
        if (!bmp || ac.signal.aborted) return
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(bmp, 0, 0)
        setLoaded(true)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [visible, sourceId, sourcePageIndex, profile.thumbWidth, priority])

  if (!sourceId) {
    return (
      <div
        ref={hostRef}
        className={cn(
          'flex aspect-[1/1.414] w-full items-center justify-center rounded-md border text-[10px] text-muted-foreground transition-[filter] duration-200',
          className,
        )}
        style={{ backgroundColor: bgColor, filter: canvasFilter || undefined }}
      >
        Blank
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      style={canvasFilter ? { filter: canvasFilter } : undefined}
      className={cn(
        'relative flex aspect-[1/1.414] w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white transition-[filter] duration-200',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn('max-h-full max-w-full object-contain transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0')}
        style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      />
      {!loaded && <div className="absolute inset-0 animate-pulse bg-secondary/70" />}
    </div>
  )
})
