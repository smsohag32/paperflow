import * as React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Download, Combine, FileText, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { PrivacyPill } from '@/components/shared/Dialogs'
import { getPageCount, mergePdfs } from '@/lib/pdf/ops'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { addHistory } from '@/lib/storage/repo'
import { formatBytes } from '@/lib/utils/format'
import { uid } from '@/lib/utils/id'

interface MergeItem {
  id: string
  file: File
  pageCount: number | null
}

function SortableFileRow({ item, index, onRemove }: { item: MergeItem; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${isDragging ? 'opacity-70 shadow-md' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-xs font-medium">
        {index + 1}
      </span>
      <FileText className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.file.size)}
          {item.pageCount !== null ? ` · ${item.pageCount} page${item.pageCount === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Remove ${item.file.name}`}>
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

export default function MergeRoute() {
  const [items, setItems] = React.useState<MergeItem[]>([])
  const [outputName, setOutputName] = React.useState('merged-document.pdf')
  const [progress, setProgress] = React.useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const addFiles = async (files: File[]) => {
    const newItems: MergeItem[] = []
    for (const file of files) {
      let pageCount: number | null = null
      try {
        pageCount = await getPageCount(file)
      } catch {
        toast.error(`Skipped "${file.name}" (not a valid or unlocked PDF)`)
        continue
      }
      newItems.push({ id: uid('m'), file, pageCount })
    }
    setItems((prev) => [...prev, ...newItems])
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id)
      const newIdx = prev.findIndex((i) => i.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const handleMerge = async () => {
    if (items.length < 2) {
      toast.info('Add at least 2 PDF files to merge.')
      return
    }
    setProgress(0.05)
    try {
      const bytes = await mergePdfs(
        items.map((i) => ({ data: i.file, name: i.file.name })),
        (p) => setProgress(p),
      )
      const name = outputName.trim().endsWith('.pdf') ? outputName.trim() : `${outputName.trim() || 'merged'}.pdf`
      downloadBlob(pdfBlob(bytes), name)
      await addHistory({
        tool: 'merge',
        title: `Merged ${items.length} PDFs`,
        inputNames: items.map((i) => i.file.name),
        outputNames: [name],
        outputSize: bytes.byteLength,
      })
      toast.success(`Merged ${items.length} files (${formatBytes(bytes.byteLength)})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setProgress(null)
    }
  }

  const totalPages = items.reduce((acc, i) => acc + (i.pageCount ?? 0), 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merge PDF</h1>
          <p className="text-sm text-muted-foreground">Combine multiple PDFs in any order without uploading them.</p>
        </div>
        <PrivacyPill />
      </div>

      <FileDropzone
        multiple
        compact={items.length > 0}
        onFiles={addFiles}
        title={items.length > 0 ? 'Add more PDFs' : 'Drop PDF files to merge'}
        description="Drag files in any order; you can reorder them below before merging"
      />

      {items.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>
                Files ({items.length}) · {totalPages} total pages
              </CardTitle>
              <CardDescription>Drag the handle to change the merge order</CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setItems((prev) => [...prev].sort((a, b) => a.file.name.localeCompare(b.file.name)))}
              >
                <ArrowUpDown className="size-3.5" /> Sort A–Z
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setItems([])}>
                Clear all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <SortableFileRow
                      key={item.id}
                      item={item}
                      index={idx}
                      onRemove={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex flex-wrap items-end gap-3 pt-2">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label htmlFor="merge-out">Output filename</Label>
                <Input id="merge-out" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
              </div>
              <Button disabled={items.length < 2 || progress !== null} onClick={handleMerge}>
                <Combine className="size-4" />
                {progress !== null ? 'Merging…' : `Merge ${items.length} PDFs`}
                <Download className="size-3.5" />
              </Button>
            </div>

            {progress !== null && <Progress value={progress * 100} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
