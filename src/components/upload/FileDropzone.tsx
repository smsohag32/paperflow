import * as React from 'react'
import { Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export interface FileDropzoneProps {
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  title?: string
  description?: string
  compact?: boolean
  className?: string
  disabled?: boolean
}

export function FileDropzone({
  accept = '.pdf,application/pdf',
  multiple = false,
  onFiles,
  title = 'Drop PDF files here',
  description = 'or browse from your device',
  compact = false,
  className,
  disabled = false,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0 || disabled) return
    const files = Array.from(list)
    onFiles(multiple ? files : [files[0]])
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/50 hover:bg-secondary/40',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-[1.03]',
          compact ? 'size-10' : 'size-12',
        )}
      >
        {dragging ? <FileText className="size-5" /> : <Upload className="size-5" />}
      </div>
      <div className="space-y-1">
        <p className={cn('font-medium tracking-tight', compact ? 'text-sm' : 'text-[15px]')}>{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            Browse files
          </Button>
        </div>
      )}
    </div>
  )
}
