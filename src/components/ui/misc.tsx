import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-secondary', className)} {...props} />
}

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: React.ComponentProps<'span'> & { variant?: 'secondary' | 'outline' | 'primary' | 'success' | 'warning' | 'destructive' }) {
  const v = {
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_30%)] dark:text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[variant]
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3',
        v,
        className,
      )}
      {...props}
    />
  )
}

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border bg-secondary px-1 font-sans text-[11px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
