import * as React from 'react'
import { ShieldCheck, Lock, Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Kbd } from '@/components/ui/misc'
import { cn } from '@/lib/utils/cn'

export function PrivacyPill({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground',
        className,
      )}
      title="All PDF processing runs locally in your browser. Files are never uploaded."
    >
      <ShieldCheck className="size-3.5 text-success" />
      {compact ? 'Local only' : 'Processed locally on your device'}
    </span>
  )
}

export function PasswordDialog({
  open,
  fileName,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean
  fileName: string
  error?: string
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const [pw, setPw] = React.useState('')
  React.useEffect(() => {
    if (open) setPw('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            Password required
          </DialogTitle>
          <DialogDescription>
            Enter the password to open <span className="font-medium text-foreground">{fileName}</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(pw)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pdf-pw">Password</Label>
            <Input
              id="pdf-pw"
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Document password"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!pw}>
              Unlock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const SHORTCUTS = [
  { keys: ['Ctrl / ⌘', 'K'], label: 'Open command palette' },
  { keys: ['Ctrl / ⌘', 'O'], label: 'Open PDF file' },
  { keys: ['Ctrl / ⌘', 'S'], label: 'Export / Save PDF' },
  { keys: ['Ctrl / ⌘', 'Z'], label: 'Undo' },
  { keys: ['Ctrl / ⌘', 'Shift', 'Z'], label: 'Redo' },
  { keys: ['Ctrl / ⌘', 'A'], label: 'Select all pages' },
  { keys: ['Ctrl / ⌘', 'F'], label: 'Search in document' },
  { keys: ['Ctrl / ⌘', '+ / -'], label: 'Zoom in / out' },
  { keys: ['Delete'], label: 'Delete selected annotation or page' },
  { keys: ['Space'], label: 'Hold to pan canvas' },
  { keys: ['Esc'], label: 'Return to Select tool / cancel' },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Navigate and edit documents faster without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="divide-y">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
