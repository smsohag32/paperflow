import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SliderMark {
  value: number
  label?: string
}

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Show a floating value pill above the thumb on hover/drag ('auto'), always, or never */
  showTooltip?: 'auto' | 'always' | 'never'
  /** Formatter for the floating value pill */
  formatValue?: (value: number) => string
  /** Optional double-click reset value on the thumb */
  resetValue?: number
  /** Optional tick marks along the track */
  marks?: SliderMark[]
  /** Visual density */
  size?: 'sm' | 'md'
}

export function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  showTooltip = 'auto',
  formatValue,
  resetValue,
  marks,
  size = 'md',
  onValueChange,
  onPointerDown,
  ...props
}: SliderProps) {
  const [dragging, setDragging] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState<number[]>(value ?? defaultValue ?? [min])

  const values = value ?? internalValue

  React.useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging])

  const handleChange = (next: number[]) => {
    if (value === undefined) setInternalValue(next)
    onValueChange?.(next)
  }

  const handleReset = () => {
    if (resetValue === undefined) return
    const clamped = Math.min(max, Math.max(min, resetValue))
    handleChange([clamped])
  }

  const tooltipVisible = showTooltip === 'always' || (showTooltip === 'auto' && (dragging || hovered))
  const span = Math.max(1e-6, max - min)

  return (
    <div className={cn('w-full', marks?.some((m) => m.label) && 'pb-4')}>
      <SliderPrimitive.Root
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={handleChange}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(e) => {
          setDragging(true)
          onPointerDown?.(e)
        }}
        className={cn(
          'group/slider relative flex w-full cursor-pointer touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:flex-col',
          size === 'sm' ? 'py-1.5' : 'py-2.5',
          className,
        )}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            'relative w-full grow overflow-hidden rounded-full bg-secondary/90 transition-colors group-hover/slider:bg-secondary',
            size === 'sm' ? 'h-1.5' : 'h-2',
          )}
        >
          <SliderPrimitive.Range
            className={cn(
              'absolute h-full rounded-full bg-primary',
              !dragging && 'transition-[width,left] duration-150 ease-out',
            )}
          />
        </SliderPrimitive.Track>

        {/* Optional clickable tick marks */}
        {marks && marks.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
            {marks.map((m) => {
              const pct = Math.min(100, Math.max(0, ((m.value - min) / span) * 100))
              const active = values[0] !== undefined && values[0] >= m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleChange([m.value])
                  }}
                  style={{ left: `${pct}%` }}
                  className="pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                  aria-label={m.label ?? String(m.value)}
                >
                  <span
                    className={cn(
                      'block size-1.5 rounded-full transition-colors',
                      active ? 'bg-primary-foreground/80' : 'bg-muted-foreground/35',
                    )}
                  />
                  {m.label && (
                    <span className="absolute top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground hover:text-foreground">
                      {m.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {values.map((val, i) => (
          <SliderPrimitive.Thumb
            key={i}
            onDoubleClick={handleReset}
            title={resetValue !== undefined ? 'Double-click to reset' : undefined}
            className={cn(
              'relative block shrink-0 cursor-grab rounded-full border-2 border-primary bg-card shadow-sm transition-transform duration-150 ease-out hover:scale-110 hover:ring-4 hover:ring-ring/30 focus-visible:scale-110 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-115 active:cursor-grabbing',
              size === 'sm' ? 'size-3.5' : 'size-4.5',
            )}
          >
            {tooltipVisible && (
              <span
                className={cn(
                  'pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-background shadow-md transition-opacity duration-150 tabular-nums',
                  dragging ? 'scale-105 opacity-100' : 'opacity-95',
                )}
              >
                {formatValue ? formatValue(val) : val}
              </span>
            )}
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
    </div>
  )
}

export interface SmoothSizeSliderPreset {
  label: string
  value: number
}

export interface SmoothSizeSliderProps {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  /** Logarithmic mapping makes wide ranges (e.g. 50 KB – 25 MB) feel smooth at both ends */
  scale?: 'linear' | 'log'
  /** Value formatting for the live badge and hover tooltip */
  formatValue?: (value: number) => string
  /** Optional subtle hint shown next to the formatted value (e.g. "~45% smaller") */
  hint?: string
  /** Default value for reset button and double-click on thumb */
  resetValue?: number
  /** Show - / + fine-adjustment buttons beside the slider */
  showSteppers?: boolean
  /** Step increment for - / + buttons (defaults to step) */
  stepperStep?: number
  /** Optional quick-snap preset pills below the slider */
  presets?: SmoothSizeSliderPreset[]
  /** Optional track marks */
  marks?: SliderMark[]
  /** Optional live visual preview element rendered inline next to the label */
  preview?: React.ReactNode
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  onChange: (value: number) => void
}

const LOG_RESOLUTION = 1000

function toSliderPos(val: number, min: number, max: number, scale: 'linear' | 'log'): number {
  const clamped = Math.min(max, Math.max(min, val))
  if (scale === 'linear') return clamped
  const safeMin = Math.max(1, min)
  const safeMax = Math.max(safeMin + 1, max)
  const t = Math.log(Math.max(safeMin, clamped) / safeMin) / Math.log(safeMax / safeMin)
  return Math.round(t * LOG_RESOLUTION)
}

function fromSliderPos(pos: number, min: number, max: number, step: number, scale: 'linear' | 'log'): number {
  if (scale === 'linear') return pos
  const safeMin = Math.max(1, min)
  const safeMax = Math.max(safeMin + 1, max)
  const t = Math.min(1, Math.max(0, pos / LOG_RESOLUTION))
  const raw = safeMin * Math.pow(safeMax / safeMin, t)
  const snapped = Math.round(raw / step) * step
  return Math.min(max, Math.max(min, snapped))
}

export function SmoothSizeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  scale = 'linear',
  formatValue = (v) => String(v),
  hint,
  resetValue,
  showSteppers = false,
  stepperStep,
  presets,
  marks,
  preview,
  size = 'md',
  disabled = false,
  className,
  onChange,
}: SmoothSizeSliderProps) {
  const sliderMin = scale === 'log' ? 0 : min
  const sliderMax = scale === 'log' ? LOG_RESOLUTION : max
  const sliderStep = scale === 'log' ? 1 : step
  const sliderVal = toSliderPos(value, min, max, scale)
  const delta = stepperStep ?? step

  const nudge = (dir: -1 | 1) => {
    const next =
      scale === 'log'
        ? fromSliderPos(sliderVal + dir * 25, min, max, step, 'log')
        : Math.min(max, Math.max(min, Number((value + dir * delta).toFixed(4))))
    onChange(next)
  }

  const sliderMarks = React.useMemo(() => {
    if (!marks) return undefined
    if (scale === 'linear') return marks
    return marks.map((m) => ({ ...m, value: toSliderPos(m.value, min, max, 'log') }))
  }, [marks, min, max, scale])

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || preview || hint) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {label && <span className="text-xs font-medium text-foreground">{label}</span>}
            {preview}
          </div>
          <div className="flex items-center gap-1.5">
            {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-foreground tabular-nums">
              {formatValue(value)}
            </span>
            {resetValue !== undefined && Math.abs(value - resetValue) > 1e-4 && (
              <button
                type="button"
                onClick={() => onChange(resetValue)}
                title="Reset to default"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Reset value"
              >
                <RotateCcw className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {showSteppers && (
          <button
            type="button"
            disabled={disabled || value <= min}
            onClick={() => nudge(-1)}
            aria-label={`Decrease ${label ?? 'size'}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Minus className="size-3" />
          </button>
        )}

        <Slider
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={[sliderVal]}
          disabled={disabled}
          size={size}
          marks={sliderMarks}
          resetValue={resetValue !== undefined ? toSliderPos(resetValue, min, max, scale) : undefined}
          formatValue={(p) => formatValue(fromSliderPos(p, min, max, step, scale))}
          onValueChange={([pos]) => onChange(fromSliderPos(pos, min, max, step, scale))}
        />

        {showSteppers && (
          <button
            type="button"
            disabled={disabled || value >= max}
            onClick={() => nudge(1)}
            aria-label={`Increase ${label ?? 'size'}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {presets.map((p) => {
            const active = Math.abs(value - p.value) <= Math.max(step * 0.5, p.value * 0.02)
            return (
              <button
                key={p.label}
                type="button"
                disabled={disabled}
                onClick={() => onChange(p.value)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
