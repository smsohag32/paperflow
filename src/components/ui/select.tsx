import * as React from 'react'
import { Select as SelectPrimitive } from 'radix-ui'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-lg border border-input bg-card px-3 text-left whitespace-nowrap shadow-xs transition-all duration-150 outline-none hover:border-primary/40 hover:bg-secondary/35 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:border-primary/60 data-[state=open]:ring-[3px] data-[state=open]:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&_svg]:shrink-0',
        size === 'sm' ? 'h-8 text-xs font-medium' : 'h-9 text-sm font-medium',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-hover:text-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={5}
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-[9rem] overflow-x-hidden overflow-y-auto rounded-xl border border-border/80 bg-popover/98 text-popover-foreground shadow-xl backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          position === 'popper' && 'w-full min-w-(--radix-select-trigger-width)',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="space-y-0.5 p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-xs font-medium transition-colors outline-none select-none hover:bg-secondary/80 focus:bg-secondary data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:text-[13px]',
        className,
      )}
      {...props}
    >
      <span className="absolute right-2.5 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase', className)}
      {...props}
    />
  )
}

/** Simple helper for option arrays */
export function SimpleSelect<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size,
  ariaLabel,
  disabled,
}: {
  value: T
  onValueChange: (v: T) => void
  options: readonly { value: T; label: React.ReactNode }[]
  className?: string
  size?: 'sm' | 'default'
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <SelectTrigger className={className} size={size} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
