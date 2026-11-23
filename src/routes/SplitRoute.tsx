import * as React from 'react'
import { Scissors, Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/radio'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { chunkGroups, extractPages, getPageCount, splitPdf } from '@/lib/pdf/ops'
import { parsePageRange, parseRangeGroups } from '@/lib/pdf/page-range'
import { downloadBlob, downloadOutputs, pdfBlob } from '@/lib/utils/download'
import { baseName, formatBytes } from '@/lib/utils/format'
import { addHistory } from '@/lib/storage/repo'

type SplitMode = 'ranges' | 'every' | 'each' | 'extract'

export default function SplitRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [pageCount, setPageCount] = React.useState(0)
  const [mode, setMode] = React.useState<SplitMode>('ranges')
  const [ranges, setRanges] = React.useState('1-2, 3-')
  const [everyN, setEveryN] = React.useState(2)
  const [extractExpr, setExtractExpr] = React.useState('1, 3')
  const [progress, setProgress] = React.useState<number | null>(null)

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    try {
      const count = await getPageCount(f)
      setFile(f)
      setPageCount(count)
      setRanges(count > 1 ? `1-${Math.ceil(count / 2)}, ${Math.ceil(count / 2) + 1}-${count}` : '1')
      setExtractExpr(count > 1 ? `1-${Math.min(3, count)}` : '1')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read PDF')
    }
  }

  const handleRun = async () => {
    if (!file || pageCount === 0) return
    setProgress(0.05)
    try {
      const stem = baseName(file.name)
      if (mode === 'extract') {
        const indices = parsePageRange(extractExpr, pageCount)
        const bytes = await extractPages(file, indices)
        const outName = `${stem}-extracted.pdf`
        downloadBlob(pdfBlob(bytes), outName)
        await addHistory({
          tool: 'split',
          title: `Extracted ${indices.length} page(s)`,
          inputNames: [file.name],
          outputNames: [outName],
          outputSize: bytes.byteLength,
        })
        toast.success(`Extracted ${indices.length} page(s)`)
      } else {
        const groups =
          mode === 'ranges'
            ? parseRangeGroups(ranges, pageCount)
            : mode === 'every'
              ? chunkGroups(pageCount, Math.max(1, everyN))
              : Array.from({ length: pageCount }, (_, i) => [i])
        const parts = await splitPdf(file, groups, { onProgress: (p) => setProgress(p) })
        const outputs = parts.map((bytes, i) => ({
          name: `${stem}-part-${i + 1}.pdf`,
          blob: pdfBlob(bytes),
        }))
        await downloadOutputs(outputs, `${stem}-split.zip`)
        await addHistory({
          tool: 'split',
          title: `Split into ${outputs.length} files`,
          inputNames: [file.name],
          outputNames: outputs.map((o) => o.name),
        })
        toast.success(`Exported ${outputs.length} PDF file(s)`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Split failed')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Split &amp; Extract PDF</h1>
          <p className="text-sm text-muted-foreground">
            Split by custom ranges, every N pages, separate every page, or extract specific pages.
          </p>
        </div>
      </div>

      {!file ? (
        <FileDropzone onFiles={handleFile} title="Drop a PDF to split" />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-primary" />
              <div>
                <CardTitle>{file.name}</CardTitle>
                <CardDescription>
                  {pageCount} page{pageCount === 1 ? '' : 's'} · {formatBytes(file.size)}
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFile(null)}>
              Change file
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <Segmented
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'ranges', label: 'By ranges' },
                { value: 'every', label: 'Every N pages' },
                { value: 'each', label: 'Every page' },
                { value: 'extract', label: 'Extract pages' },
              ]}
            />

            {mode === 'ranges' && (
              <div className="space-y-1.5">
                <Label htmlFor="split-ranges">Page ranges (comma-separated — each becomes a PDF)</Label>
                <Input
                  id="split-ranges"
                  value={ranges}
                  onChange={(e) => setRanges(e.target.value)}
                  placeholder="e.g. 1-3, 4-6, 7-"
                />
              </div>
            )}

            {mode === 'every' && (
              <div className="space-y-1.5">
                <Label htmlFor="split-n">Pages per file</Label>
                <Input
                  id="split-n"
                  type="number"
                  min={1}
                  max={Math.max(1, pageCount)}
                  value={everyN}
                  onChange={(e) => setEveryN(Math.max(1, Number(e.target.value) || 1))}
                  className="w-32"
                />
              </div>
            )}

            {mode === 'each' && (
              <p className="text-sm text-muted-foreground">
                Creates {pageCount} individual PDF files and bundles them into a single ZIP archive.
              </p>
            )}

            {mode === 'extract' && (
              <div className="space-y-1.5">
                <Label htmlFor="extract-expr">Pages to extract into one PDF (supports odd, even, 1-3, 5, last)</Label>
                <Input
                  id="extract-expr"
                  value={extractExpr}
                  onChange={(e) => setExtractExpr(e.target.value)}
                  placeholder="e.g. 1-3, 5, odd"
                />
              </div>
            )}

            {progress !== null && <Progress value={progress * 100} />}

            <Button disabled={progress !== null} onClick={handleRun}>
              <Scissors className="size-4" />
              {progress !== null ? 'Splitting…' : mode === 'extract' ? 'Extract & Download PDF' : 'Split & Download'}
              <Download className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
