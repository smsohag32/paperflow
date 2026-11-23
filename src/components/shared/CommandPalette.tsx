import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  FileText,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  LayoutDashboard,
  Grid2x2,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { TOOLS } from '@/app/config/tools'
import { usePreferences } from '@/stores/preferences'
import { listLibraryFiles } from '@/lib/storage/repo'
import type { LibraryFile } from '@/types/common'
import { formatBytes } from '@/lib/utils/format'

export function CommandPalette({
  open,
  onOpenChange,
  onOpenShortcuts,
  onOpenRecentFile,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpenShortcuts: () => void
  onOpenRecentFile: (id: string) => void
}) {
  const navigate = useNavigate()
  const setPref = usePreferences((s) => s.set)
  const pushRecentTool = usePreferences((s) => s.pushRecentTool)
  const [recent, setRecent] = React.useState<LibraryFile[]>([])

  React.useEffect(() => {
    if (open) listLibraryFiles(6).then(setRecent).catch(() => {})
  }, [open])

  const go = (route: string, toolId?: string) => {
    if (toolId) pushRecentTool(toolId)
    onOpenChange(false)
    navigate(route)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-lg overflow-hidden p-0">
        <Command>
          <CommandInput placeholder="Search tools, recent files, or actions…" />
          <CommandList>
            <CommandEmpty>No matching tools or commands.</CommandEmpty>
            <CommandGroup heading="Tools">
              {TOOLS.map((t) => {
                const Icon = t.icon
                return (
                  <CommandItem
                    key={t.id}
                    value={`${t.name} ${t.description} ${t.keywords.join(' ')}`}
                    onSelect={() => go(t.route, t.id)}
                  >
                    <Icon className="size-4" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{t.description}</span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {recent.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent local files">
                  {recent.map((f) => (
                    <CommandItem
                      key={f.id}
                      value={`file ${f.name}`}
                      onSelect={() => {
                        onOpenChange(false)
                        onOpenRecentFile(f.id)
                      }}
                    >
                      <FileText className="size-4" />
                      <span className="truncate">{f.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Navigation & Appearance">
              <CommandItem onSelect={() => go('/')}>
                <LayoutDashboard className="size-4" /> Dashboard
              </CommandItem>
              <CommandItem onSelect={() => go('/tools')}>
                <Grid2x2 className="size-4" /> All Tools
              </CommandItem>
              <CommandItem onSelect={() => go('/privacy')}>
                <ShieldCheck className="size-4" /> Privacy Dashboard
              </CommandItem>
              <CommandItem onSelect={() => go('/settings')}>
                <Settings className="size-4" /> Settings & Performance
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onOpenChange(false)
                  onOpenShortcuts()
                }}
              >
                <Keyboard className="size-4" /> Keyboard Shortcuts
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setPref({ theme: 'light' })
                  onOpenChange(false)
                }}
              >
                <Sun className="size-4" /> Switch to Light Mode
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setPref({ theme: 'dark' })
                  onOpenChange(false)
                }}
              >
                <Moon className="size-4" /> Switch to Dark Mode
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setPref({ theme: 'system' })
                  onOpenChange(false)
                }}
              >
                <Monitor className="size-4" /> Use System Theme
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
