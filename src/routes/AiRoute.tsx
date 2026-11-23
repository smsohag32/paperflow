import * as React from 'react'
import {
  Sparkles,
  Send,
  Download,
  Trash2,
  Languages,
  Briefcase,
  Cpu,
  HardDrive,
  X,
  CheckCircle2,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Segmented } from '@/components/ui/radio'
import { Badge } from '@/components/ui/misc'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { extractPdfText, type ExtractedPageText } from '@/lib/pdf/extract'
import {
  clearAllCachedModels,
  getCachedModelIds,
  LOCAL_MODELS,
  removeCachedModel,
  TRANSLATION_LANGUAGES,
} from '@/lib/ai/models'
import {
  aiClient,
  analyzeResume,
  chunkDocument,
  extractStructuredEntities,
  getRecommendedModel,
  retrieveRelevantChunks,
  type ResumeAudit,
  type StructuredExtraction,
} from '@/lib/ai/engine'
import { usePreferences, type AiMode } from '@/stores/preferences'
import { detectCapabilities } from '@/lib/performance/device'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { textToPdf } from '@/lib/pdf/convert'
import { baseName } from '@/lib/utils/format'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  { label: 'Summarize', prompt: 'Provide a clear, concise summary of this document.' },
  { label: 'Bullet Points', prompt: 'Summarize the key points in 5-8 concise bullet points.' },
  { label: 'Action Items', prompt: 'List concrete action items, deadlines, and responsibilities mentioned.' },
  { label: 'Study Notes', prompt: 'Create structured study notes with key definitions and takeaways.' },
  { label: 'Flashcards', prompt: 'Create 5 Q&A study flashcards based strictly on this document.' },
  { label: 'FAQs', prompt: 'Generate 5 frequently asked questions and answers from this document.' },
  { label: 'Simplify', prompt: 'Explain the main concepts of this document in simple, everyday language.' },
]

export default function AiRoute() {
  const aiMode = usePreferences((s) => s.aiMode)
  const setPref = usePreferences((s) => s.set)
  const caps = React.useMemo(() => detectCapabilities(), [])

  // Loaded document context
  const [file, setFile] = React.useState<File | null>(null)
  const [pages, setPages] = React.useState<ExtractedPageText[]>([])
  const [entities, setEntities] = React.useState<StructuredExtraction | null>(null)

  // Chat state
  const [chatModelId, setChatModelId] = React.useState(() => getRecommendedModel(aiMode, 'chat').id)
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const [question, setQuestion] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // Model manager state
  const [cachedIds, setCachedIds] = React.useState<Set<string>>(new Set())
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [downloadStatus, setDownloadStatus] = React.useState('')

  // Translation state
  const [srcLang, setSrcLang] = React.useState('en')
  const [tgtLang, setTgtLang] = React.useState('bn')
  const [translateInput, setTranslateInput] = React.useState('')
  const [translateOutput, setTranslateOutput] = React.useState('')
  const [translating, setTranslating] = React.useState(false)

  // Resume state
  const [jobDesc, setJobDesc] = React.useState('')
  const [resumeAudit, setResumeAudit] = React.useState<ResumeAudit | null>(null)

  const refreshCache = React.useCallback(async () => {
    setCachedIds(await getCachedModelIds())
  }, [])

  React.useEffect(() => {
    refreshCache().catch(() => {})
  }, [refreshCache])

  const handleUploadDoc = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setMessages([])
    try {
      const extracted = await extractPdfText(f)
      setPages(extracted)
      const full = extracted.map((p) => p.text).join('\n\n')
      setEntities(extractStructuredEntities(full))
      setTranslateInput(full.slice(0, 4000))
      setResumeAudit(analyzeResume(full, jobDesc, f.size))
      toast.success(`Loaded ${extracted.length} page(s) into local AI context`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not extract PDF text')
      setFile(null)
    }
  }

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingId(modelId)
    setDownloadProgress(0.02)
    setDownloadStatus('Initializing download…')
    try {
      await aiClient.loadModel(modelId, (p) => {
        if (typeof p.progress === 'number') setDownloadProgress(p.progress)
        setDownloadStatus(p.file ? `${p.status}: ${p.file}` : p.status)
      })
      await refreshCache()
      toast.success('Model downloaded and cached locally')
    } catch (e) {
      if ((e as Error)?.message !== 'Cancelled') {
        toast.error(e instanceof Error ? e.message : 'Model download failed')
      }
    } finally {
      setDownloadingId(null)
      setDownloadStatus('')
    }
  }

  const askAi = async (promptText: string) => {
    const q = promptText.trim()
    if (!q || busy) return
    if (!cachedIds.has(chatModelId) && !aiClient.loadedModels.has(chatModelId)) {
      toast.info('Download a local AI model in the Model Manager tab first (models are never downloaded silently).')
      return
    }
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    setBusy(true)
    try {
      const chunks = chunkDocument(pages)
      const top = retrieveRelevantChunks(chunks, q, 3)
      const context = top.map((c) => `[Page ${(c.pageIndex ?? 0) + 1}] ${c.text}`).join('\n\n')
      const reply = await aiClient.generate(
        chatModelId,
        [
          {
            role: 'system',
            content:
              'You are PaperFlow AI, a private local PDF assistant. Answer accurately using only the provided document excerpts. If the answer is not in the document, say so honestly.',
          },
          {
            role: 'user',
            content: context ? `Document excerpts:\n${context}\n\nRequest: ${q}` : q,
          },
        ],
        340,
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '(No response generated)' }])
    } catch (e) {
      if ((e as Error)?.message !== 'Cancelled') {
        toast.error(e instanceof Error ? e.message : 'Inference failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const runTranslate = async () => {
    if (!translateInput.trim()) return
    const modelId = 'Xenova/m2m100_418M'
    if (!cachedIds.has(modelId) && !aiClient.loadedModels.has(modelId)) {
      toast.info('Download "M2M100 418M" in the Model Manager tab first to run local translation.')
      return
    }
    setTranslating(true)
    try {
      const out = await aiClient.translate(modelId, translateInput, srcLang, tgtLang)
      setTranslateOutput(out)
      toast.success('Translation completed locally')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  const fullText = pages.map((p) => p.text).join('\n\n')

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Local AI Workspace</h1>
          <p className="text-sm text-muted-foreground">
            100% free, open-source browser AI via Transformers.js. Zero API keys, zero cloud uploads, opt-in model downloads.
          </p>
        </div>
      </div>

      {/* Document context loader */}
      <FileDropzone
        compact
        onFiles={handleUploadDoc}
        title={
          file
            ? `Active document: ${file.name} (${pages.length} page${pages.length === 1 ? '' : 's'}) — click to switch`
            : 'Load a PDF into AI Workspace (optional)'
        }
        description="Text is extracted locally on your device. Large documents are automatically chunked for retrieval."
      />

      <Tabs defaultValue="assistant">
        <TabsList className="flex-wrap">
          <TabsTrigger value="assistant">
            <Sparkles className="size-3.5" /> Document Assistant
          </TabsTrigger>
          <TabsTrigger value="translate">
            <Languages className="size-3.5" /> Translate (EN ↔ BN)
          </TabsTrigger>
          <TabsTrigger value="resume">
            <Briefcase className="size-3.5" /> Resume Assistant
          </TabsTrigger>
          <TabsTrigger value="models">
            <Cpu className="size-3.5" /> Model Manager ({cachedIds.size} cached)
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Document Assistant */}
        <TabsContent value="assistant" className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Chat with your PDF</CardTitle>
                <CardDescription>
                  AI responses are generated locally and may be inaccurate — always verify important details.
                </CardDescription>
              </div>
              <SimpleSelect
                size="sm"
                className="w-52"
                value={chatModelId}
                onValueChange={setChatModelId}
                options={LOCAL_MODELS.filter((m) => m.task === 'chat').map((m) => ({
                  value: m.id,
                  label: `${m.name}${cachedIds.has(m.id) ? ' ✓' : ''}`,
                }))}
              />
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              {/* Quick prompt chips */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((qp) => (
                  <Button
                    key={qp.label}
                    size="xs"
                    variant="secondary"
                    disabled={busy || !pages.length}
                    onClick={() => askAi(qp.prompt)}
                  >
                    {qp.label}
                  </Button>
                ))}
              </div>

              {/* Conversation */}
              <div className="min-h-[260px] max-h-[420px] flex-1 space-y-3 overflow-y-auto rounded-lg border bg-secondary/20 p-3 scrollbar-thin">
                {messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    Download a chat model in Model Manager, then ask a question or pick a quick action above.
                  </p>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === 'user' ? 'ml-8 bg-primary text-primary-foreground' : 'mr-8 border bg-card'
                      }`}
                    >
                      {m.content}
                    </div>
                  ))
                )}
              </div>

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  askAi(question)
                }}
              >
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask anything about your document…"
                  disabled={busy}
                />
                {busy ? (
                  <Button type="button" variant="outline" onClick={() => aiClient.cancelAll()}>
                    <X className="size-4" /> Stop
                  </Button>
                ) : (
                  <Button type="submit" disabled={!question.trim()}>
                    <Send className="size-4" />
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Instant zero-download local extraction */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Instant Local Extraction</CardTitle>
              <CardDescription>Works immediately with zero model downloads</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {!entities ? (
                <p className="text-muted-foreground">Load a PDF above to extract dates, contacts, amounts, and key highlights instantly.</p>
              ) : (
                <>
                  {entities.keySentences.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold">Key Highlights</p>
                      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                        {entities.keySentences.slice(0, 4).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border p-2">
                      <p className="font-medium">Dates ({entities.dates.length})</p>
                      <p className="truncate text-muted-foreground">{entities.dates.slice(0, 3).join(', ') || 'None'}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-medium">Amounts ({entities.amounts.length})</p>
                      <p className="truncate text-muted-foreground">{entities.amounts.slice(0, 3).join(', ') || 'None'}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-medium">Emails ({entities.emails.length})</p>
                      <p className="truncate text-muted-foreground">{entities.emails.slice(0, 2).join(', ') || 'None'}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-medium">Phones ({entities.phones.length})</p>
                      <p className="truncate text-muted-foreground">{entities.phones.slice(0, 2).join(', ') || 'None'}</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Local Translation */}
        <TabsContent value="translate" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Local Multilingual Translation (English ↔ Bangla &amp; more)</CardTitle>
              <CardDescription>
                Uses Meta&apos;s open-source M2M100 418M (MIT license) locally in your browser. Preserves paragraph breaks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <SimpleSelect
                  size="sm"
                  className="w-44"
                  value={srcLang}
                  onValueChange={setSrcLang}
                  options={TRANSLATION_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
                />
                <span className="text-xs text-muted-foreground">→</span>
                <SimpleSelect
                  size="sm"
                  className="w-44"
                  value={tgtLang}
                  onValueChange={setTgtLang}
                  options={TRANSLATION_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
                />
                <Button size="sm" disabled={translating || !translateInput.trim()} onClick={runTranslate}>
                  <Languages className="size-4" /> {translating ? 'Translating…' : 'Translate Locally'}
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Source text</Label>
                  <Textarea
                    rows={10}
                    value={translateInput}
                    onChange={(e) => setTranslateInput(e.target.value)}
                    placeholder="Load a PDF above or paste text to translate…"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Translated output</Label>
                    {translateOutput && (
                      <div className="flex gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(translateOutput)
                            toast.success('Copied translation')
                          }}
                        >
                          <Copy className="size-3" /> Copy
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={async () => {
                            const bytes = await textToPdf(translateOutput, { title: 'Translated Document' })
                            downloadBlob(pdfBlob(bytes), `${file ? baseName(file.name) : 'translation'}-${tgtLang}.pdf`)
                          }}
                        >
                          <Download className="size-3" /> PDF
                        </Button>
                      </div>
                    )}
                  </div>
                  <Textarea rows={10} value={translateOutput} readOnly placeholder="Translation will appear here…" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Resume & Job Application Assistant */}
        <TabsContent value="resume" className="mt-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Resume &amp; Job Description Matcher</CardTitle>
                <CardDescription>
                  Audits structure, missing sections, and keyword overlap without ever fabricating experience.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Paste target job description (optional)</Label>
                  <Textarea
                    rows={7}
                    value={jobDesc}
                    onChange={(e) => {
                      setJobDesc(e.target.value)
                      if (fullText) setResumeAudit(analyzeResume(fullText, e.target.value, file?.size ?? 0))
                    }}
                    placeholder="Paste job requirements to compare keywords…"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!fullText}
                  onClick={() => setResumeAudit(analyzeResume(fullText, jobDesc, file?.size ?? 0))}
                >
                  Re-analyze Resume
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resume Audit Report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {!resumeAudit ? (
                  <p className="text-muted-foreground">Upload your CV / Resume PDF above to see a full structural audit.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{resumeAudit.wordCount} words</Badge>
                      <Badge variant={resumeAudit.hasContact ? 'success' : 'warning'}>
                        {resumeAudit.hasContact ? 'Contact detected' : 'No email detected'}
                      </Badge>
                      <Badge variant={resumeAudit.hasMetrics ? 'success' : 'warning'}>
                        {resumeAudit.hasMetrics ? 'Metrics present' : 'Add measurable outcomes'}
                      </Badge>
                      {resumeAudit.matchScore !== null && (
                        <Badge variant="primary">JD Keyword Match: {resumeAudit.matchScore}%</Badge>
                      )}
                    </div>

                    <div>
                      <p className="font-semibold">Detected Sections</p>
                      <p className="text-muted-foreground">{resumeAudit.detectedSections.join(', ') || 'None'}</p>
                    </div>
                    {resumeAudit.missingSections.length > 0 && (
                      <div>
                        <p className="font-semibold">Missing Common Sections</p>
                        <p className="text-muted-foreground">{resumeAudit.missingSections.join(', ')}</p>
                      </div>
                    )}
                    {resumeAudit.missingKeywords.length > 0 && (
                      <div>
                        <p className="font-semibold">Missing JD Keywords (add only if truthful)</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {resumeAudit.missingKeywords.slice(0, 14).map((k) => (
                            <Badge key={k} variant="outline">
                              {k}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {resumeAudit.suggestions.length > 0 && (
                      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                        {resumeAudit.suggestions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded bg-secondary/50 p-2">
                      Suggested filename: <span className="font-mono font-medium">{resumeAudit.suggestedFilename}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: AI Model Manager */}
        <TabsContent value="models" className="mt-5 space-y-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>AI Performance Mode &amp; Hardware</CardTitle>
                <CardDescription>
                  Device: {caps.cores} CPU threads · {caps.memoryGB ? `${caps.memoryGB} GB RAM` : 'RAM unknown'} ·{' '}
                  {caps.webgpu ? 'WebGPU available' : 'WASM CPU fallback'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Segmented
                  size="sm"
                  value={aiMode}
                  onValueChange={(v) => {
                    setPref({ aiMode: v as AiMode })
                    setChatModelId(getRecommendedModel(v as AiMode, 'chat').id)
                  }}
                  options={[
                    { value: 'light', label: 'Light AI' },
                    { value: 'balanced', label: 'Balanced AI' },
                    { value: 'advanced', label: 'Advanced AI' },
                  ]}
                />
                {cachedIds.size > 0 && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      await clearAllCachedModels()
                      await refreshCache()
                      toast.success('Cleared all cached AI models')
                    }}
                  >
                    <Trash2 className="size-3.5" /> Clear Cache
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {downloadingId && (
            <Card className="border-primary/40">
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{downloadStatus || 'Downloading model weights…'}</span>
                  <div className="flex items-center gap-2">
                    <span>{Math.round(downloadProgress * 100)}%</span>
                    <Button size="xs" variant="ghost" onClick={() => aiClient.cancelAll()}>
                      Cancel
                    </Button>
                  </div>
                </div>
                <Progress value={downloadProgress * 100} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {LOCAL_MODELS.map((m) => {
              const isCached = cachedIds.has(m.id)
              const isDownloading = downloadingId === m.id
              return (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-[15px]">{m.name}</CardTitle>
                        <CardDescription className="mt-0.5 text-xs">{m.description}</CardDescription>
                      </div>
                      {isCached ? (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3" /> Cached
                        </Badge>
                      ) : (
                        <Badge variant="outline">{m.sizeLabel}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant="secondary">{m.license}</Badge>
                      <Badge variant="outline">{m.ramEstimate}</Badge>
                      <Badge variant="outline">
                        {m.webgpuSupported ? 'WebGPU + WASM' : 'WASM CPU'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {m.tier} tier
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        disabled={!!downloadingId}
                        onClick={() => handleDownloadModel(m.id)}
                      >
                        <Download className="size-3.5" />
                        {isDownloading ? 'Downloading…' : isCached ? 'Load into Memory' : `Download (${m.sizeLabel})`}
                      </Button>
                      {isCached && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={async () => {
                            await removeCachedModel(m.id)
                            await refreshCache()
                            toast.success(`Removed ${m.name} from local cache`)
                          }}
                        >
                          <HardDrive className="size-3.5" /> Remove
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              All AI models are open-source (Apache-2.0 / MIT) and run strictly inside your browser&apos;s Web Worker.
              Downloads come directly from Hugging Face Hub when you click Download and are cached locally for offline use.
            </span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
