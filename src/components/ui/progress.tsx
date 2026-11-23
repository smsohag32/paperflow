import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils/cn'

export function Progress({
  className,
  value,
  indeterminate,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indeterminate?: boolean }) {
  return (
    <ProgressPrimitive.Root
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      value={indeterminate ? null : value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'h-full bg-primary transition-transform duration-300',
          indeterminate && 'w-1/3 animate-[pf-indeterminate_1.2s_ease-in-out_infinite]',
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }}
      />
      <style>{`@keyframes pf-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </ProgressPrimitive.Root>
  )
}
