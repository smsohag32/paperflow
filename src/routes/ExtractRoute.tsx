import * as React from 'react'
import { useNavigate } from 'react-router'
import { Table2, Copy, Download, FileSearch, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { PrivacyPill } from '@/components/shared/Dialogs'
import {
  auditPages,
  classifyDocument,
  extractPdfTables,
  extractPdfText,
  tableToCsv,
  type DocumentClassification,
  type ExtractedPageText,
  type ExtractedTable,
  type PageAuditResult,
} from '@/lib/pdf/extract'
import { TOOL_BY_ID } from '@/app/config/tools'
import { downloadBlob } from '@/lib/utils/download'
import { baseName } from '@/lib/utils/format'

export default function ExtractRoute() {
  const navigate = useNavigate()
  const [file, setFile] = React.useState<File | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [pages, setPages] = React.useState<ExtractedPageText[]>([])
  const [tables, setTables] = React.useState<ExtractedTable[]>([])
  const [classification, setClassification] = React.useState<DocumentClassification | null>(null)
  const [audit, setAudit] = React.useState<PageAuditResult | null>(null)

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setLoading(true)
    try {
      const [textPages, foundTables, auditRes] = await Promise.all([
        extractPdfText(f),
        extractPdfTables(f),
        auditPages(f),
      ])
      setPages(textPages)
      setTables(foundTables)
      setAudit(auditRes)
      setClassification(classifyDocument(textPages.map((p) => p.text).join('\n'), textPages.length))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extraction failed')
      setFile(null)
    } finally {
      setLoading(false)
    }
  }

  const allText = pages.map((p) => `--- Page ${p.pageIndex + 1} ---\n${p.text}`).join('\n\n')

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Extract &amp; Document Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Extract text &amp; tables (CSV/JSON), classify document type, and audit blank, duplicate, or scanned pages.
          </p>
        </div>
        <PrivacyPill />
      </div>

      {!file ? (
        <FileDropzone onFiles={handleFile} title="Drop a PDF to extract text, tables, and page insights" />
      ) : loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Analyzing document locally…</Card>
      ) : (
        <div className="space-y-5">
          {/* Classification + Smart Audit Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            {classification && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="size-4 text-primary" /> Smart Classification
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{classification.type}</span>
                    <Badge variant="primary">{Math.round(classification.confidence * 100)}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{classification.reasons.join(' · ')}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {classification.suggestedTools.map((id) => {
                      const t = TOOL_BY_ID[id]
                      if (!t) return null
                      return (
                        <Button key={id} size="xs" variant="secondary" onClick={() => navigate(t.route)}>
                          {t.shortName}
                        </Button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {audit && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileSearch className="size-4 text-primary" /> Smart Page Audit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p className="text-muted-foreground">{audit.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {audit.blankPages.length > 0 && (
                      <Badge variant="warning">
                        <AlertTriangle className="size-3" /> Blank/No-text: p.
                        {audit.blankPages.map((i) => i + 1).join(', ')}
                      </Badge>
                    )}
                    {audit.duplicatePairs.length > 0 && (
                      <Badge variant="warning">
                        Duplicates: {audit.duplicatePairs.map(([a, b]) => `${a + 1}=${b + 1}`).join(', ')}
                      </Badge>
                    )}
                    {audit.scannedPages.length > 0 && (
                      <Badge variant="outline">
                        Needs OCR: {audit.scannedPages.length} page(s)
                      </Badge>
                    )}
                    {audit.blankPages.length === 0 && audit.duplicatePairs.length === 0 && (
                      <Badge variant="success">
                        <CheckCircle2 className="size-3" /> Clean structure
                      </Badge>
                    )}
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setFile(null)}>
                    Analyze another PDF
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <Tabs defaultValue="tables">
            <TabsList>
              <TabsTrigger value="tables">
                <Table2 className="size-3.5" /> Tables ({tables.length})
              </TabsTrigger>
              <TabsTrigger value="text">Full Text ({pages.length} pages)</TabsTrigger>
            </TabsList>

            <TabsContent value="tables" className="mt-4 space-y-4">
              {tables.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  No structured multi-column tables detected in selectable text. For scanned PDFs, run OCR first.
                </Card>
              ) : (
                tables.map((t, idx) => (
                  <Card key={idx}>
                    <CardHeader className="flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">
                          Table {idx + 1} · Page {t.pageIndex + 1}
                        </CardTitle>
                        <CardDescription>
                          {t.rows.length} rows × {t.rows[0]?.length ?? 0} columns (spatial text heuristic)
                        </CardDescription>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(tableToCsv(t.rows))
                            toast.success('Copied CSV')
                          }}
                        >
                          <Copy className="size-3" /> Copy CSV
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            downloadBlob(
                              new Blob([tableToCsv(t.rows)], { type: 'text/csv;charset=utf-8' }),
                              `${baseName(file.name)}-table-${idx + 1}.csv`,
                            )
                          }
                        >
                          <Download className="size-3" /> CSV
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            downloadBlob(
                              new Blob([JSON.stringify(t.rows, null, 2)], { type: 'application/json' }),
                              `${baseName(file.name)}-table-${idx + 1}.json`,
                            )
                          }
                        >
                          <Download className="size-3" /> JSON
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {t.rows.slice(0, 25).map((row, ri) => (
                            <tr key={ri} className={ri === 0 ? 'bg-secondary/60 font-medium' : 'border-t'}>
                              {row.map((cell, ci) => (
                                <td key={ci} className="border px-2 py-1.5">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="text" className="mt-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">Extracted Text</CardTitle>
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(allText)
                        toast.success('Copied all text')
                      }}
                    >
                      <Copy className="size-3" /> Copy
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        downloadBlob(new Blob([allText], { type: 'text/plain;charset=utf-8' }), `${baseName(file.name)}.txt`)
                      }
                    >
                      <Download className="size-3" /> TXT
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 font-sans text-xs leading-relaxed">
                    {allText || '(No selectable text found — try OCR Studio)'}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
