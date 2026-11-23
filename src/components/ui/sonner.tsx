import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { usePreferences } from '@/stores/preferences'

export function Toaster(props: ToasterProps) {
  const theme = usePreferences((s) => s.theme)
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-lg! border! bg-popover! text-popover-foreground! shadow-md! text-[13px]!',
          description: 'text-muted-foreground!',
        },
      }}
      {...props}
    />
  )
}
