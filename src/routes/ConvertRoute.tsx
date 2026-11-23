import * as React from 'react'
import { Download, ArrowLeftRight, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { SimpleSelect } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import {
  docxToPdf,
  htmlToPdf,
  imagesToPdf,
  PAGE_SIZES,
  pdfToImages,
  textToPdf,
  type PageSizeKey,
} from '@/lib/pdf/convert'
import { extractPdfText } from '@/lib/pdf/extract'
import { downloadBlob, downloadOutputs, pdfBlob } from '@/lib/utils/download'
import { baseName } from '@/lib/utils/format'

export default function ConvertRoute() {
  const [imgFiles, setImgFiles] = React.useState<File[]>([])
  const [pageSize, setPageSize] = React.useState<PageSizeKey>('a4')
  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>('portrait')
  const [margin, setMargin] = React.useState(24)
  const [fitMode, setFitMode] = React.useState<'fit' | 'fill'>('fit')

  const [pdfFile, setPdfFile] = React.useState<File | null>(null)
  const [imgFormat, setImgFormat] = React.useState<'png' | 'jpeg' | 'webp'>('png')
  const [dpi, setDpi] = React.useState(150)
  const [quality, setQuality] = React.useState(88)

  const [plainText, setPlainText] = React.useState('')
  const [textTitle, setTextTitle] = React.useState('Document')
  const [htmlInput, setHtmlInput] = React.useState('<h1>Report</h1><p>Paste HTML content here to convert locally into a PDF.</p>')

  const [progress, setProgress] = React.useState<number | null>(null)

  const runImagesToPdf = async () => {
    if (!imgFiles.length) return
    setProgress(0.05)
    try {
      const bytes = await imagesToPdf(imgFiles, {
        pageSize,
        orientation,
        margin,
        fitMode,
        align: 'center',
        bgColor: '#ffffff',
        onProgress: (p) => setProgress(p),
      })
      downloadBlob(pdfBlob(bytes), `${baseName(imgFiles[0].name)}-images.pdf`)
      toast.success(`Converted ${imgFiles.length} image(s) to PDF`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setProgress(null)
    }
  }

  const runPdfToImages = async () => {
    if (!pdfFile) return
    setProgress(0.05)
    try {
      const outputs = await pdfToImages(pdfFile, {
        format: imgFormat,
        dpi,
        quality: quality / 100,
        onProgress: (p) => setProgress(p),
      })
      await downloadOutputs(outputs, `${baseName(pdfFile.name)}-images.zip`)
      toast.success(`Exported ${outputs.length} ${imgFormat.toUpperCase()} image(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setProgress(null)
    }
  }

  const runPdfToText = async (file: File) => {
    setProgress(0.1)
    try {
      const pages = await extractPdfText(file, { onProgress: (p) => setProgress(p) })
      const content = pages.map((p) => `--- Page ${p.pageIndex + 1} ---\n${p.text}`).join('\n\n')
      downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${baseName(file.name)}.txt`)
      toast.success('Extracted text file downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Text extraction failed')
    } finally {
      setProgress(null)
    }
  }

  const runDocxToPdf = async (file: File) => {
    setProgress(0.2)
    try {
      const bytes = await docxToPdf(file)
      downloadBlob(pdfBlob(bytes), `${baseName(file.name)}.pdf`)
      toast.success('Converted DOCX to PDF')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'DOCX conversion failed')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Convert Studio</h1>
          <p className="text-sm text-muted-foreground">Convert between PDF, Images, Text, HTML, and DOCX locally.</p>
        </div>
      </div>

      <Tabs defaultValue="img2pdf">
        <TabsList className="flex-wrap">
          <TabsTrigger value="img2pdf">Images → PDF</TabsTrigger>
          <TabsTrigger value="pdf2img">PDF → Images</TabsTrigger>
          <TabsTrigger value="text">Text / HTML → PDF</TabsTrigger>
          <TabsTrigger value="doc">DOCX / PDF → Text</TabsTrigger>
        </TabsList>

        <TabsContent value="img2pdf" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Images to PDF</CardTitle>
              <CardDescription>Combine JPG, PNG, and WebP images into a clean PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone
                compact
                multiple
                accept="image/jpeg,image/png,image/webp"
                onFiles={(f) => setImgFiles((prev) => [...prev, ...f])}
                title={imgFiles.length ? `${imgFiles.length} image(s) queued — click to add more` : 'Drop JPG, PNG, or WebP images'}
              />
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label>Page size</Label>
                  <SimpleSelect
                    size="sm"
                    value={pageSize}
                    onValueChange={(v) => setPageSize(v as PageSizeKey)}
                    options={Object.entries(PAGE_SIZES).map(([k, v]) => ({ value: k as PageSizeKey, label: v.label }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Orientation</Label>
                  <SimpleSelect
                    size="sm"
                    value={orientation}
                    onValueChange={(v) => setOrientation(v as 'portrait' | 'landscape')}
                    options={[
                      { value: 'portrait', label: 'Portrait' },
                      { value: 'landscape', label: 'Landscape' },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fit</Label>
                  <SimpleSelect
                    size="sm"
                    value={fitMode}
                    onValueChange={(v) => setFitMode(v as 'fit' | 'fill')}
                    options={[
                      { value: 'fit', label: 'Fit inside margins' },
                      { value: 'fill', label: 'Fill page' },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Margin ({margin}pt)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={144}
                    className="h-8"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              {progress !== null && <Progress value={progress * 100} />}
              <div className="flex items-center gap-2">
                <Button disabled={!imgFiles.length || progress !== null} onClick={runImagesToPdf}>
                  <ArrowLeftRight className="size-4" /> Create PDF
                </Button>
                {imgFiles.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setImgFiles([])}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf2img" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>PDF to Images</CardTitle>
              <CardDescription>Render PDF pages to PNG, JPEG, or WebP and download as a ZIP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone
                compact
                onFiles={(f) => setPdfFile(f[0] ?? null)}
                title={pdfFile ? pdfFile.name : 'Drop a PDF to export pages as images'}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Format</Label>
                  <SimpleSelect
                    size="sm"
                    value={imgFormat}
                    onValueChange={(v) => setImgFormat(v as 'png' | 'jpeg' | 'webp')}
                    options={[
                      { value: 'png', label: 'PNG (Lossless)' },
                      { value: 'jpeg', label: 'JPEG' },
                      { value: 'webp', label: 'WebP' },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Resolution ({dpi} DPI)</Label>
                  <Slider min={72} max={300} value={[dpi]} onValueChange={([v]) => setDpi(v)} />
                </div>
                <div className="space-y-1">
                  <Label>Quality ({quality}%)</Label>
                  <Slider min={40} max={100} value={[quality]} onValueChange={([v]) => setQuality(v)} />
                </div>
              </div>
              {progress !== null && <Progress value={progress * 100} />}
              <Button disabled={!pdfFile || progress !== null} onClick={runPdfToImages}>
                <Download className="size-4" /> Export Images
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="text" className="mt-5 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Plain Text → PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="Title" />
              <Textarea
                rows={7}
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="Paste or type text here…"
              />
              <Button
                disabled={!plainText.trim()}
                onClick={async () => {
                  const bytes = await textToPdf(plainText, { title: textTitle })
                  downloadBlob(pdfBlob(bytes), `${textTitle || 'text'}.pdf`)
                  toast.success('PDF downloaded')
                }}
              >
                <Download className="size-4" /> Export PDF
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HTML → PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={9} value={htmlInput} onChange={(e) => setHtmlInput(e.target.value)} />
              <Button
                disabled={!htmlInput.trim()}
                onClick={async () => {
                  const bytes = await htmlToPdf(htmlInput, 'HTML Export')
                  downloadBlob(pdfBlob(bytes), 'html-export.pdf')
                  toast.success('PDF downloaded')
                }}
              >
                <Download className="size-4" /> Export PDF
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="doc" className="mt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>DOCX → PDF</CardTitle>
                <CardDescription>Extracts text flow using open-source mammoth.js locally.</CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropzone
                  compact
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onFiles={(f) => f[0] && runDocxToPdf(f[0])}
                  title="Drop a .docx file"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>PDF → Plain Text (.txt)</CardTitle>
                <CardDescription>Extract readable text from all pages locally.</CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropzone
                  compact
                  onFiles={(f) => f[0] && runPdfToText(f[0])}
                  title="Drop a PDF to extract .txt"
                />
              </CardContent>
            </Card>
          </div>
          <div className="flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Browser-local DOCX &amp; HTML conversion preserves readable text flow without requiring cloud servers,
              though complex Word layouts (floating shapes, footnotes, custom fonts) are simplified.
            </span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
