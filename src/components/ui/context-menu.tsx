import * as React from 'react'
import { ContextMenu as CM } from 'radix-ui'
import { cn } from '@/lib/utils/cn'

export const ContextMenu = CM.Root
export const ContextMenuTrigger = CM.Trigger

export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content
        className={cn(
          'z-50 min-w-[11rem] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </CM.Portal>
  )
}

export function ContextMenuItem({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof CM.Item> & { variant?: 'destructive' }) {
  return (
    <CM.Item
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof CM.Separator>) {
  return <CM.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
