import * as React from 'react'
import { ScanText, Download, Copy, X, FileSearch, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { buildSearchablePdf, OCR_LANGUAGES, runOcrOnPdf, type OcrPageResult } from '@/lib/ocr/ocr'
import { parsePageRange } from '@/lib/pdf/page-range'
import { getPageCount } from '@/lib/pdf/ops'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { baseName } from '@/lib/utils/format'

export default function OcrRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [pageCount, setPageCount] = React.useState(1)
  const [languages, setLanguages] = React.useState<string[]>(['eng'])
  const [pageExpr, setPageExpr] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [stage, setStage] = React.useState('')
  const [results, setResults] = React.useState<OcrPageResult[]>([])
  const [searchTerm, setSearchTerm] = React.useState('')
  const [buildingPdf, setBuildingPdf] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setResults([])
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      try {
        const n = await getPageCount(f)
        setPageCount(n)
        setPageExpr(n > 5 ? '1-5' : '')
      } catch {
        setPageCount(1)
      }
    } else {
      setPageCount(1)
      setPageExpr('')
    }
  }

  const toggleLang = (code: string) => {
    setLanguages((prev) =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter((c) => c !== code) : prev) : [...prev, code],
    )
  }

  const startOcr = async () => {
    if (!file) return
    let pages: number[] | undefined
    if (pageExpr.trim() && pageCount > 1) {
      try {
        pages = parsePageRange(pageExpr, pageCount)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Invalid page range')
        return
      }
    }
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setProgress(0.02)
    setStage('Loading OCR engine…')
    setResults([])
    try {
      const res = await runOcrOnPdf(file, {
        languages,
        pages,
        signal: ac.signal,
        onProgress: (p) => {
          const overall = (p.pageIndex + p.progress) / Math.max(1, p.totalPages)
          setProgress(overall)
          setStage(`Page ${p.pageIndex + 1}/${p.totalPages} — ${p.stage}`)
        },
      })
      setResults(res)
      toast.success(`OCR completed for ${res.length} page(s)`)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.error(e instanceof Error ? e.message : 'OCR failed. Verify internet if downloading a new language for the first time.')
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const fullText = results.map((r) => `--- Page ${r.pageIndex + 1} (${r.confidence}% conf) ---\n${r.text}`).join('\n\n')

  const exportSearchable = async () => {
    if (!file || !results.length) return
    setBuildingPdf(true)
    try {
      const bytes = await buildSearchablePdf(file, results)
      downloadBlob(pdfBlob(bytes), `${baseName(file.name)}-searchable.pdf`)
      toast.success('Searchable PDF downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to build searchable PDF')
    } finally {
      setBuildingPdf(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OCR &amp; Searchable PDF</h1>
          <p className="text-sm text-muted-foreground">
            Extract text from scanned PDFs and images locally with Tesseract.js (English, Bangla &amp; more).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document &amp; Language Setup</CardTitle>
          <CardDescription>
            Language packs are downloaded on demand and cached in your browser for offline reuse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            compact
            accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
            onFiles={handleFile}
            title={file ? `${file.name} (${pageCount} page${pageCount === 1 ? '' : 's'})` : 'Drop a scanned PDF or image'}
          />

          <div className="space-y-2">
            <Label>OCR Languages</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {OCR_LANGUAGES.map((lang) => {
                const checked = languages.includes(lang.code)
                return (
                  <label
                    key={lang.code}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                      checked ? 'border-primary bg-primary/5' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleLang(lang.code)} />
                    <span className="truncate font-medium">{lang.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{lang.approxSizeMB}M</span>
                  </label>
                )
              })}
            </div>
          </div>

          {file && pageCount > 1 && (
            <div className="max-w-xs space-y-1">
              <Label>Pages to OCR (leave blank for all {pageCount})</Label>
              <Input value={pageExpr} onChange={(e) => setPageExpr(e.target.value)} placeholder={`e.g. 1-${Math.min(5, pageCount)}`} />
            </div>
          )}

          {running && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{stage}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button disabled={!file || running} onClick={startOcr}>
              <ScanText className="size-4" /> {running ? 'Recognizing…' : 'Run Local OCR'}
            </Button>
            {running && (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <X className="size-4" /> Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>OCR Results ({results.length} page{results.length === 1 ? '' : 's'})</CardTitle>
              <CardDescription>
                Avg confidence:{' '}
                {Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length)}%
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" disabled={buildingPdf} onClick={exportSearchable}>
                <FileSearch className="size-3.5" /> {buildingPdf ? 'Building…' : 'Searchable PDF'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(fullText)
                  toast.success('Copied text to clipboard')
                }}
              >
                <Copy className="size-3.5" /> Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadBlob(new Blob([fullText], { type: 'text/plain;charset=utf-8' }), `${baseName(file!.name)}-ocr.txt`)
                }
              >
                <Download className="size-3.5" /> TXT
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }),
                    `${baseName(file!.name)}-ocr.json`,
                  )
                }
              >
                <Download className="size-3.5" /> JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search recognized text…"
              className="max-w-sm"
            />
            <div className="space-y-3">
              {results.map((r) => (
                <div key={r.pageIndex} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Page {r.pageIndex + 1}</span>
                    <Badge variant={r.confidence >= 80 ? 'success' : 'warning'}>{r.confidence}% confidence</Badge>
                    {r.lowConfidenceCount > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <AlertTriangle className="size-3 text-warning" /> {r.lowConfidenceCount} low-conf words
                      </Badge>
                    )}
                  </div>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-secondary/40 p-2.5 font-sans text-xs leading-relaxed">
                    {searchTerm.trim()
                      ? r.text
                          .split('\n')
                          .filter((l) => l.toLowerCase().includes(searchTerm.toLowerCase()))
                          .join('\n') || '(No matches on this page)'
                      : r.text || '(No text detected)'}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
