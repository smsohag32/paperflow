import * as React from 'react'
import { RadioGroup as RG, ToggleGroup as TG } from 'radix-ui'
import { cn } from '@/lib/utils/cn'

export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RG.Root>) {
  return <RG.Root className={cn('grid gap-2', className)} {...props} />
}

export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RG.Item>) {
  return (
    <RG.Item
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input bg-card shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      <RG.Indicator className="flex items-center justify-center">
        <span className="size-2 rounded-full bg-primary" />
      </RG.Indicator>
    </RG.Item>
  )
}

/** Segmented control */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'default',
  ariaLabel,
}: {
  value: T
  onValueChange: (v: T) => void
  options: readonly { value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }[]
  className?: string
  size?: 'sm' | 'default'
  ariaLabel?: string
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex items-center rounded-lg bg-secondary p-[3px]', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs [&_svg:not([class*='size-'])]:size-4",
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
          )}
        >
          {o.icon}
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  )
}

export { TG as ToggleGroupPrimitive }
