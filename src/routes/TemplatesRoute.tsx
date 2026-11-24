import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  Receipt,
  FileUser,
  Award,
  Mail,
  Download,
  FileEdit,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  Upload,
  PenTool,
  Sparkles,
  Save,
  FolderDown,
  FolderUp,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  X,
  Palette,
  Clock,
  CheckCircle2,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { SimpleSelect } from '@/components/ui/select'
import { SmoothSizeSlider } from '@/components/ui/slider'
import { Segmented } from '@/components/ui/radio'
import { Badge } from '@/components/ui/misc'
import { TemplatePreview } from '@/components/templates/TemplatePreview'
import {
  ACCENT_PRESETS,
  CURRENCIES,
  computeInvoiceTotals,
  createDefaultTheme,
  createNewTemplateProject,
  createSampleCertificate,
  createSampleInvoice,
  createSampleLetterhead,
  createSampleResume,
  deleteTemplateProject,
  deriveDefaultTitle,
  deriveProjectSubtitle,
  formatMoney,
  generateCertificatePdf,
  generateInvoicePdf,
  generateLetterheadPdf,
  generateResumePdf,
  listTemplateProjects,
  upsertTemplateProject,
  type CertificateData,
  type CertificateStyle,
  type InvoiceData,
  type InvoiceStyle,
  type LetterheadData,
  type LetterheadStyle,
  type ResumeData,
  type ResumeStyle,
  type TemplateFont,
  type TemplateKind,
  type TemplateProject,
  type TemplateTheme,
} from '@/lib/pdf/templates'
import { listSignaturePresets } from '@/lib/image/signature'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { addHistory } from '@/lib/storage/repo'
import { useWorkspace } from '@/stores/workspace'
import type { StoredSignature } from '@/lib/storage/db'
import { cn } from '@/lib/utils/cn'

const TEMPLATE_TABS: {
  id: TemplateKind
  label: string
  tagline: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'invoice', label: 'Invoice', tagline: 'Auto tax & total', icon: Receipt },
  { id: 'resume', label: 'Resume / CV', tagline: 'ATS & modern layouts', icon: FileUser },
  { id: 'certificate', label: 'Certificate', tagline: 'Awards & courses', icon: Award },
  { id: 'letterhead', label: 'Letterhead', tagline: 'Official business letter', icon: Mail },
]

const TEMPLATE_META: Record<TemplateKind, (typeof TEMPLATE_TABS)[number]> = {
  invoice: TEMPLATE_TABS[0],
  resume: TEMPLATE_TABS[1],
  certificate: TEMPLATE_TABS[2],
  letterhead: TEMPLATE_TABS[3],
}

const CERTIFICATE_TITLE_PRESETS = [
  'CERTIFICATE OF ACHIEVEMENT',
  'CERTIFICATE OF COMPLETION',
  'CERTIFICATE OF APPRECIATION',
  'CERTIFICATE OF EXCELLENCE',
]

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 45) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function TemplatesRoute() {
  const navigate = useNavigate()
  const openFile = useWorkspace((s) => s.openFile)

  // Hub state: list of all auto-saved drafts + manually saved projects
  const [projects, setProjects] = React.useState<TemplateProject[]>(() => listTemplateProjects())
  const [filterKind, setFilterKind] = React.useState<'all' | TemplateKind>('all')
  const [hubSearch, setHubSearch] = React.useState('')

  // Active editor state (null = Hub view, non-null = Editor view)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [projectTitle, setProjectTitle] = React.useState('')
  const [titleManuallyEdited, setTitleManuallyEdited] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  const [createdAt, setCreatedAt] = React.useState<number>(() => Date.now())
  const [kind, setKind] = React.useState<TemplateKind>('invoice')
  const [theme, setTheme] = React.useState<TemplateTheme>(() => createDefaultTheme())
  const [invoice, setInvoice] = React.useState<InvoiceData>(() => createSampleInvoice())
  const [resume, setResume] = React.useState<ResumeData>(() => createSampleResume())
  const [certificate, setCertificate] = React.useState<CertificateData>(() => createSampleCertificate())
  const [letterhead, setLetterhead] = React.useState<LetterheadData>(() => createSampleLetterhead())

  const [previewZoom, setPreviewZoom] = React.useState(80)
  const [exporting, setExporting] = React.useState(false)
  const [signatures, setSignatures] = React.useState<StoredSignature[]>([])
  const [designExpanded, setDesignExpanded] = React.useState(true)

  const logoInputRef = React.useRef<HTMLInputElement>(null)
  const sigInputRef = React.useRef<HTMLInputElement>(null)
  const jsonInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    listSignaturePresets().then(setSignatures).catch(() => {})
  }, [])

  // Open a brand-new project when clicking one of the 4 boxes on the Hub
  const openNewProject = (newKind: TemplateKind) => {
    const proj = createNewTemplateProject(newKind)
    const nextList = upsertTemplateProject(proj)
    setProjects(nextList)
    setActiveId(proj.id)
    setKind(proj.kind)
    setProjectTitle(proj.title)
    setTitleManuallyEdited(false)
    setIsSaved(false)
    setCreatedAt(proj.createdAt)
    setTheme(proj.theme)
    setInvoice(proj.invoice)
    setResume(proj.resume)
    setCertificate(proj.certificate)
    setLetterhead(proj.letterhead)
    setPreviewZoom(newKind === 'certificate' ? 62 : 80)
  }

  // Open an existing saved project or auto-draft from Recent Projects
  const openExistingProject = (proj: TemplateProject) => {
    setActiveId(proj.id)
    setKind(proj.kind)
    setProjectTitle(proj.title)
    setTitleManuallyEdited(true)
    setIsSaved(proj.saved)
    setCreatedAt(proj.createdAt)
    setTheme(proj.theme)
    setInvoice(proj.invoice)
    setResume(proj.resume)
    setCertificate(proj.certificate)
    setLetterhead(proj.letterhead)
    setPreviewZoom(proj.kind === 'certificate' ? 62 : 80)
  }

  const buildCurrentProjectObject = React.useCallback(
    (explicitSaved?: boolean): TemplateProject | null => {
      if (!activeId) return null
      const autoTitle = deriveDefaultTitle(kind, invoice, resume, certificate, letterhead)
      const finalTitle = titleManuallyEdited && projectTitle.trim() ? projectTitle.trim() : autoTitle
      return {
        id: activeId,
        kind,
        title: finalTitle,
        saved: explicitSaved ?? isSaved,
        createdAt,
        updatedAt: Date.now(),
        theme,
        invoice,
        resume,
        certificate,
        letterhead,
      }
    },
    [activeId, kind, invoice, resume, certificate, letterhead, titleManuallyEdited, projectTitle, isSaved, createdAt, theme],
  )

  // Auto-save active project cleanly into Recent Projects whenever edited
  React.useEffect(() => {
    if (!activeId) return
    const timer = setTimeout(() => {
      const proj = buildCurrentProjectObject()
      if (!proj) return
      if (!titleManuallyEdited) setProjectTitle(proj.title)
      setProjects(upsertTemplateProject(proj))
    }, 450)
    return () => clearTimeout(timer)
  }, [activeId, buildCurrentProjectObject, titleManuallyEdited])

  const handleBackToHub = () => {
    const proj = buildCurrentProjectObject()
    if (proj) setProjects(upsertTemplateProject(proj))
    setActiveId(null)
  }

  const handleDuplicateProject = (proj: TemplateProject) => {
    const now = Date.now()
    const copy: TemplateProject = {
      ...structuredClone(proj),
      id: `tpl-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${proj.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
    }
    setProjects(upsertTemplateProject(copy))
    toast.success(`Duplicated "${proj.title}"`)
  }

  const handleDeleteProject = (proj: TemplateProject) => {
    setProjects(deleteTemplateProject(proj.id))
    toast.info(`Deleted "${proj.title}"`)
  }

  const buildActivePdf = async (): Promise<{ bytes: Uint8Array; filename: string; title: string }> => {
    if (kind === 'invoice') {
      const bytes = await generateInvoicePdf(invoice, theme)
      const slug = (invoice.invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '-')
      return { bytes, filename: `${slug}.pdf`, title: `Generated Invoice ${invoice.invoiceNumber}` }
    }
    if (kind === 'resume') {
      const bytes = await generateResumePdf(resume, theme)
      const slug = (resume.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
      return { bytes, filename: `${slug}-resume.pdf`, title: `Generated Resume (${resume.fullName})` }
    }
    if (kind === 'certificate') {
      const bytes = await generateCertificatePdf(certificate, theme)
      const slug = (certificate.recipientName || 'certificate').trim().replace(/\s+/g, '-').toLowerCase()
      return { bytes, filename: `${slug}-certificate.pdf`, title: `Generated Certificate (${certificate.recipientName})` }
    }
    const bytes = await generateLetterheadPdf(letterhead, theme)
    const slug = (letterhead.companyName || 'letterhead').trim().replace(/\s+/g, '-').toLowerCase()
    return { bytes, filename: `${slug}-letter.pdf`, title: `Generated Letterhead (${letterhead.companyName})` }
  }

  const handleDownloadPdf = async () => {
    setExporting(true)
    try {
      const { bytes, filename, title } = await buildActivePdf()
      downloadBlob(pdfBlob(bytes), filename)
      await addHistory({
        tool: 'templates',
        title,
        inputNames: [kind],
        outputNames: [filename],
        outputSize: bytes.byteLength,
      })
      toast.success(`Exported ${filename}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleOpenInWorkspace = async () => {
    setExporting(true)
    try {
      const { bytes, filename } = await buildActivePdf()
      const file = new File([pdfBlob(bytes)], filename, { type: 'application/pdf' })
      await openFile(file)
      toast.success(`Opened ${filename} in PDF Workspace`)
      navigate('/workspace')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open in Workspace')
    } finally {
      setExporting(false)
    }
  }

  const handleSaveManual = () => {
    const proj = buildCurrentProjectObject(true)
    if (!proj) return
    setIsSaved(true)
    setProjects(upsertTemplateProject(proj))
    toast.success(`Saved "${proj.title}"`)
  }

  const handleExportJson = () => {
    const proj = buildCurrentProjectObject()
    if (!proj) return
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `paperflow-${kind}-project.json`)
    toast.success('Project exported as JSON')
  }

  const handleImportJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<TemplateProject>
      const importedKind: TemplateKind = parsed.kind ?? 'invoice'
      const base = createNewTemplateProject(importedKind)
      const merged: TemplateProject = {
        ...base,
        ...parsed,
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        saved: true,
        updatedAt: Date.now(),
      }
      setProjects(upsertTemplateProject(merged))
      openExistingProject(merged)
      toast.success(`Imported "${merged.title}"`)
    } catch {
      toast.error('Invalid template JSON file')
    }
  }

  const handleResetActive = () => {
    if (kind === 'invoice') setInvoice(createSampleInvoice())
    else if (kind === 'resume') setResume(createSampleResume())
    else if (kind === 'certificate') setCertificate(createSampleCertificate())
    else setLetterhead(createSampleLetterhead())
    toast.info('Reset to clean sample template')
  }

  const handleImagePick = async (file: File, target: 'logoDataUrl' | 'signatureDataUrl') => {
    try {
      const dataUrl = await blobToDataUrl(file)
      setTheme((t) => ({ ...t, [target]: dataUrl }))
      toast.success(target === 'logoDataUrl' ? 'Logo added' : 'Signature added')
    } catch {
      toast.error('Could not load image')
    }
  }

  const filteredProjects = React.useMemo(() => {
    const q = hubSearch.trim().toLowerCase()
    return projects.filter((p) => {
      if (filterKind !== 'all' && p.kind !== filterKind) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        deriveProjectSubtitle(p).toLowerCase().includes(q) ||
        p.kind.includes(q)
      )
    })
  }, [projects, filterKind, hubSearch])

  /* ═══════════════════════ VIEW 1: TEMPLATES HUB ═══════════════════════ */
  if (!activeId) {
    return (
      <div className="w-full space-y-8 px-4 py-6 md:px-6 lg:px-8">
        <input
          ref={jsonInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportJson(f)
            e.target.value = ''
          }}
        />

        {/* Hub Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Document Templates Studio</h1>
              <Badge variant="primary">100% Local Vector PDF</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Click any template below to start a new document, or continue working on your saved drafts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => jsonInputRef.current?.click()}>
            <FolderUp className="size-3.5" /> Import JSON
          </Button>
        </div>

        {/* Create New Template Boxes (matches user screenshot layout) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Create New Document
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATE_TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openNewProject(t.id)}
                  className="group relative flex items-center gap-3.5 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm active:scale-[0.99]"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                      {t.label}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{t.tagline}</div>
                  </div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary/70 text-muted-foreground opacity-70 transition-all group-hover:bg-primary/15 group-hover:text-primary group-hover:opacity-100">
                    <Plus className="size-4" />
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Recent Projects & Saved Drafts */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight">Recent Projects &amp; Drafts</h2>
              <Badge variant="outline">{projects.length}</Badge>
            </div>

            {projects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
                  {(['all', 'invoice', 'resume', 'certificate', 'letterhead'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilterKind(f)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                        filterKind === f
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      {f === 'all' ? 'All' : TEMPLATE_META[f].label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={hubSearch}
                    onChange={(e) => setHubSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="h-8 w-44 pl-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Sparkles className="size-5" />
                </div>
                <p className="text-sm font-medium">No recent projects yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Click any template box above to create your first Invoice, Resume, Certificate, or Letterhead.
                  Every edit is automatically saved here as a draft so you can reopen it anytime.
                </p>
              </CardContent>
            </Card>
          ) : filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No projects match your current filter.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProjects.map((proj) => {
                const meta = TEMPLATE_META[proj.kind]
                const Icon = meta.icon
                return (
                  <div
                    key={proj.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openExistingProject(proj)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openExistingProject(proj)
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* Brand color strip */}
                    <div className="h-1.5 w-full" style={{ backgroundColor: proj.theme.accentColor }} />

                    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                              style={{ backgroundColor: proj.theme.accentColor }}
                            >
                              <Icon className="size-4" />
                            </div>
                            <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
                          </div>
                          <Badge variant={proj.saved ? 'success' : 'outline'} className="text-[10px]">
                            {proj.saved ? 'Saved' : 'Draft'}
                          </Badge>
                        </div>

                        <div>
                          <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
                            {proj.title}
                          </h3>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {deriveProjectSubtitle(proj)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelativeTime(proj.updatedAt)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Duplicate project"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDuplicateProject(proj)
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteProject(proj)
                            }}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  /* ═══════════════════════ VIEW 2: TEMPLATE EDITOR ═══════════════════════ */
  const invoiceTotals = computeInvoiceTotals(invoice)
  const activeMeta = TEMPLATE_META[kind]
  const ActiveIcon = activeMeta.icon

  return (
    <div className="w-full space-y-5 px-4 py-5 md:px-6 lg:px-8">
      {/* Hidden file inputs */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImagePick(f, 'logoDataUrl')
          e.target.value = ''
        }}
      />
      <input
        ref={sigInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImagePick(f, 'signatureDataUrl')
          e.target.value = ''
        }}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportJson(f)
          e.target.value = ''
        }}
      />

      {/* Editor Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={handleBackToHub}>
            <ArrowLeft className="size-3.5" /> Back
          </Button>
          <div
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-white sm:flex"
            style={{ backgroundColor: theme.accentColor }}
          >
            <ActiveIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Input
                value={projectTitle}
                onChange={(e) => {
                  setProjectTitle(e.target.value)
                  setTitleManuallyEdited(true)
                }}
                aria-label="Project title"
                className="h-8 max-w-xs border-transparent bg-transparent px-1.5 text-base font-semibold hover:border-border focus-visible:border-input focus-visible:bg-card"
              />
              <Badge variant={isSaved ? 'success' : 'outline'} className="shrink-0 text-[10px]">
                {isSaved ? (
                  <>
                    <CheckCircle2 className="mr-1 size-3" /> Saved
                  </>
                ) : (
                  'Auto-draft'
                )}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={handleSaveManual} title="Save project">
            <Save className="size-3.5" /> Save
          </Button>
          <Button variant="outline" size="xs" onClick={handleExportJson} title="Export JSON backup">
            <FolderDown className="size-3.5" /> JSON
          </Button>
          <Button variant="ghost" size="xs" onClick={handleResetActive} title="Reset to sample">
            <RotateCcw className="size-3.5" /> Sample
          </Button>
          <Button variant="secondary" size="sm" disabled={exporting} onClick={handleOpenInWorkspace}>
            <FileEdit className="size-3.5" /> Open in Workspace
          </Button>
          <Button size="sm" disabled={exporting} onClick={handleDownloadPdf}>
            <Download className="size-3.5" /> {exporting ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Main Split-Pane Studio: Left Form + Right Sticky Paper Preview */}
      <div className="grid items-start gap-6 xl:grid-cols-12">
        {/* LEFT: Design + Content Editor */}
        <div className="space-y-4 xl:col-span-6">
          {/* Brand & Design Panel */}
          <Card>
            <CardHeader className="flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Palette className="size-4 text-primary" /> Brand, Style &amp; Typography
              </CardTitle>
              <Button variant="ghost" size="xs" onClick={() => setDesignExpanded((v) => !v)}>
                {designExpanded ? 'Hide' : 'Customize'}
              </Button>
            </CardHeader>
            {designExpanded && (
              <CardContent className="space-y-4 border-t pt-4">
                {/* Layout style */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Layout style</Label>
                    {kind === 'invoice' && (
                      <Segmented<InvoiceStyle>
                        size="sm"
                        value={invoice.style}
                        onValueChange={(style) => setInvoice((d) => ({ ...d, style }))}
                        options={[
                          { value: 'modern', label: 'Modern' },
                          { value: 'classic', label: 'Classic' },
                          { value: 'minimal', label: 'Minimal' },
                        ]}
                      />
                    )}
                    {kind === 'resume' && (
                      <Segmented<ResumeStyle>
                        size="sm"
                        value={resume.style}
                        onValueChange={(style) => setResume((d) => ({ ...d, style }))}
                        options={[
                          { value: 'modern', label: '2-Column' },
                          { value: 'executive', label: 'Executive' },
                          { value: 'classic', label: 'ATS Classic' },
                        ]}
                      />
                    )}
                    {kind === 'certificate' && (
                      <Segmented<CertificateStyle>
                        size="sm"
                        value={certificate.style}
                        onValueChange={(style) => setCertificate((d) => ({ ...d, style }))}
                        options={[
                          { value: 'classic-gold', label: 'Classic Gold' },
                          { value: 'modern-indigo', label: 'Modern' },
                          { value: 'royal-emerald', label: 'Royal' },
                        ]}
                      />
                    )}
                    {kind === 'letterhead' && (
                      <Segmented<LetterheadStyle>
                        size="sm"
                        value={letterhead.style}
                        onValueChange={(style) => setLetterhead((d) => ({ ...d, style }))}
                        options={[
                          { value: 'corporate', label: 'Corporate' },
                          { value: 'editorial', label: 'Editorial' },
                          { value: 'minimal', label: 'Minimal' },
                        ]}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Typography</Label>
                    <Segmented<TemplateFont>
                      size="sm"
                      value={theme.font}
                      onValueChange={(font) => setTheme((t) => ({ ...t, font }))}
                      options={[
                        { value: 'sans', label: 'Sans' },
                        { value: 'serif', label: 'Serif' },
                        { value: 'mono', label: 'Mono' },
                      ]}
                    />
                  </div>
                </div>

                {/* Brand Accent Color + Font Scale */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Brand accent color</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ACCENT_PRESETS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.name}
                          onClick={() => setTheme((t) => ({ ...t, accentColor: c.hex }))}
                          style={{ backgroundColor: c.hex }}
                          className={cn(
                            'size-6 rounded-full border-2 transition-transform hover:scale-110',
                            theme.accentColor.toLowerCase() === c.hex
                              ? 'scale-110 border-foreground ring-2 ring-primary/30'
                              : 'border-transparent',
                          )}
                          aria-label={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Custom brand color"
                        value={theme.accentColor}
                        onChange={(e) => setTheme((t) => ({ ...t, accentColor: e.target.value }))}
                        className="h-6 w-7 cursor-pointer rounded border"
                      />
                    </div>
                  </div>

                  <SmoothSizeSlider
                    label="Text scale"
                    value={Math.round(theme.fontScale * 100)}
                    min={85}
                    max={115}
                    step={1}
                    size="sm"
                    showSteppers
                    stepperStep={5}
                    resetValue={100}
                    formatValue={(v) => `${v}%`}
                    onChange={(v) => setTheme((t) => ({ ...t, fontScale: v / 100 }))}
                  />
                </div>

                {/* Logo & Signature Uploaders */}
                {kind !== 'resume' && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button variant="outline" size="xs" onClick={() => logoInputRef.current?.click()}>
                      <Upload className="size-3.5" /> {theme.logoDataUrl ? 'Replace Logo' : 'Add Logo'}
                    </Button>
                    {theme.logoDataUrl && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setTheme((t) => ({ ...t, logoDataUrl: undefined }))}
                        title="Remove logo"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}

                    <Button variant="outline" size="xs" onClick={() => sigInputRef.current?.click()}>
                      <PenTool className="size-3.5" /> {theme.signatureDataUrl ? 'Replace Signature' : 'Add Signature'}
                    </Button>
                    {theme.signatureDataUrl && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setTheme((t) => ({ ...t, signatureDataUrl: undefined }))}
                        title="Remove signature"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}

                    {signatures.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {signatures.slice(0, 3).map((sig) => (
                          <Button
                            key={sig.id}
                            variant="secondary"
                            size="xs"
                            onClick={async () => {
                              const url = await blobToDataUrl(sig.blob)
                              setTheme((t) => ({ ...t, signatureDataUrl: url }))
                              toast.success(`Applied signature "${sig.name}"`)
                            }}
                          >
                            <Sparkles className="size-3" /> {sig.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* ───────── INVOICE EDITOR ───────── */}
          {kind === 'invoice' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Invoice Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Invoice #</Label>
                    <div className="flex gap-1">
                      <Input
                        className="h-8 text-xs"
                        value={invoice.invoiceNumber}
                        onChange={(e) => setInvoice((d) => ({ ...d, invoiceNumber: e.target.value }))}
                      />
                      <Button
                        variant="outline"
                        size="icon-xs"
                        className="h-8 w-8 shrink-0"
                        title="Generate new invoice number"
                        onClick={() =>
                          setInvoice((d) => ({
                            ...d,
                            invoiceNumber: `INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`,
                          }))
                        }
                      >
                        <Sparkles className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <SimpleSelect
                      size="sm"
                      value={invoice.status}
                      onValueChange={(v) => setInvoice((d) => ({ ...d, status: v as InvoiceData['status'] }))}
                      options={[
                        { value: 'UNPAID', label: 'Unpaid' },
                        { value: 'PAID', label: 'Paid' },
                        { value: 'DRAFT', label: 'Draft' },
                        { value: 'OVERDUE', label: 'Overdue' },
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <SimpleSelect
                      size="sm"
                      value={invoice.currency}
                      onValueChange={(v) => setInvoice((d) => ({ ...d, currency: v }))}
                      options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Issue Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={invoice.issueDate}
                      onChange={(e) => setInvoice((d) => ({ ...d, issueDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={invoice.dueDate}
                      onChange={(e) => setInvoice((d) => ({ ...d, dueDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Authorized Signer</Label>
                    <Input
                      className="h-8 text-xs"
                      value={invoice.signerName}
                      onChange={(e) => setInvoice((d) => ({ ...d, signerName: e.target.value }))}
                      placeholder="Your name"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">From (Your Business)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Business / Freelancer name"
                      value={invoice.fromName}
                      onChange={(e) => setInvoice((d) => ({ ...d, fromName: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Email"
                      value={invoice.fromEmail}
                      onChange={(e) => setInvoice((d) => ({ ...d, fromEmail: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Phone"
                      value={invoice.fromPhone}
                      onChange={(e) => setInvoice((d) => ({ ...d, fromPhone: e.target.value }))}
                    />
                    <Textarea
                      rows={2}
                      className="text-xs"
                      placeholder="Business address"
                      value={invoice.fromAddress}
                      onChange={(e) => setInvoice((d) => ({ ...d, fromAddress: e.target.value }))}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Bill To (Client)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Client name"
                      value={invoice.toName}
                      onChange={(e) => setInvoice((d) => ({ ...d, toName: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Client company"
                      value={invoice.toCompany}
                      onChange={(e) => setInvoice((d) => ({ ...d, toCompany: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Client email"
                      value={invoice.toEmail}
                      onChange={(e) => setInvoice((d) => ({ ...d, toEmail: e.target.value }))}
                    />
                    <Textarea
                      rows={2}
                      className="text-xs"
                      placeholder="Client address"
                      value={invoice.toAddress}
                      onChange={(e) => setInvoice((d) => ({ ...d, toAddress: e.target.value }))}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Line Items */}
              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Line Items ({invoice.items.length})</CardTitle>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      setInvoice((d) => ({
                        ...d,
                        items: [...d.items, { id: String(Date.now()), description: '', quantity: 1, rate: 0 }],
                      }))
                    }
                  >
                    <Plus className="size-3.5" /> Add Item
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {invoice.items.map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-12 items-center gap-1.5 rounded-lg border bg-secondary/20 p-2">
                      <Input
                        className="col-span-12 h-8 text-xs sm:col-span-6"
                        placeholder={`Item ${idx + 1} description`}
                        value={it.description}
                        onChange={(e) =>
                          setInvoice((d) => ({
                            ...d,
                            items: d.items.map((x) => (x.id === it.id ? { ...x, description: e.target.value } : x)),
                          }))
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="col-span-4 h-8 text-xs sm:col-span-2"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) =>
                          setInvoice((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id ? { ...x, quantity: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="col-span-5 h-8 text-xs sm:col-span-2"
                        placeholder="Rate"
                        value={it.rate}
                        onChange={(e) =>
                          setInvoice((d) => ({
                            ...d,
                            items: d.items.map((x) =>
                              x.id === it.id ? { ...x, rate: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                      />
                      <div className="col-span-3 flex items-center justify-end gap-0.5 sm:col-span-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Duplicate item"
                          onClick={() =>
                            setInvoice((d) => ({
                              ...d,
                              items: [...d.items, { ...it, id: `${Date.now()}-${Math.random()}` }],
                            }))
                          }
                        >
                          <Copy className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={invoice.items.length <= 1}
                          onClick={() =>
                            setInvoice((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))
                          }
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Discount, Tax, Shipping + Auto Total */}
                  <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Discount ({invoice.discountType === 'percent' ? '%' : invoice.currency})</Label>
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs"
                          value={invoice.discountValue}
                          onChange={(e) => setInvoice((d) => ({ ...d, discountValue: Number(e.target.value) || 0 }))}
                        />
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() =>
                            setInvoice((d) => ({
                              ...d,
                              discountType: d.discountType === 'percent' ? 'fixed' : 'percent',
                            }))
                          }
                        >
                          {invoice.discountType === 'percent' ? '%' : '$'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Tax / VAT (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-8 text-xs"
                        value={invoice.taxRate}
                        onChange={(e) => setInvoice((d) => ({ ...d, taxRate: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Shipping / Extra</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-xs"
                        value={invoice.shipping}
                        onChange={(e) => setInvoice((d) => ({ ...d, shipping: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  {/* Live Calculated Totals Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Subtotal:{' '}
                      <strong className="text-foreground">{formatMoney(invoiceTotals.subtotal, invoice.currency)}</strong>
                      {invoiceTotals.taxAmount > 0 && (
                        <>
                          {' '}
                          · Tax:{' '}
                          <strong className="text-foreground">{formatMoney(invoiceTotals.taxAmount, invoice.currency)}</strong>
                        </>
                      )}
                    </span>
                    <span className="text-sm font-bold text-primary tabular-nums">
                      Total: {formatMoney(invoiceTotals.grandTotal, invoice.currency)}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Payment Terms</Label>
                      <Input
                        className="h-8 text-xs"
                        value={invoice.paymentTerms}
                        onChange={(e) => setInvoice((d) => ({ ...d, paymentTerms: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Notes</Label>
                      <Input
                        className="h-8 text-xs"
                        value={invoice.notes}
                        onChange={(e) => setInvoice((d) => ({ ...d, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ───────── RESUME / CV EDITOR ───────── */}
          {kind === 'resume' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Personal Info &amp; Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Full name"
                      value={resume.fullName}
                      onChange={(e) => setResume((d) => ({ ...d, fullName: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Job title / Headline"
                      value={resume.headline}
                      onChange={(e) => setResume((d) => ({ ...d, headline: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Email"
                      value={resume.email}
                      onChange={(e) => setResume((d) => ({ ...d, email: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Phone"
                      value={resume.phone}
                      onChange={(e) => setResume((d) => ({ ...d, phone: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Location"
                      value={resume.location}
                      onChange={(e) => setResume((d) => ({ ...d, location: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Portfolio / GitHub / LinkedIn"
                      value={resume.website}
                      onChange={(e) => setResume((d) => ({ ...d, website: e.target.value }))}
                    />
                  </div>
                  <Textarea
                    rows={3}
                    className="text-xs"
                    placeholder="Professional summary…"
                    value={resume.summary}
                    onChange={(e) => setResume((d) => ({ ...d, summary: e.target.value }))}
                  />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Skills (comma-separated)</Label>
                      <Input
                        className="h-8 text-xs"
                        value={resume.skills}
                        onChange={(e) => setResume((d) => ({ ...d, skills: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Languages</Label>
                      <Input
                        className="h-8 text-xs"
                        value={resume.languages}
                        onChange={(e) => setResume((d) => ({ ...d, languages: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Experience */}
              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Work Experience ({resume.experience.length})</CardTitle>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      setResume((d) => ({
                        ...d,
                        experience: [
                          ...d.experience,
                          { id: String(Date.now()), role: '', company: '', location: '', period: '', bullets: '' },
                        ],
                      }))
                    }
                  >
                    <Plus className="size-3.5" /> Add Role
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resume.experience.map((exp, idx) => (
                    <div key={exp.id} className="space-y-2 rounded-lg border bg-secondary/20 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Role #{idx + 1}</span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={idx === 0}
                            onClick={() =>
                              setResume((d) => {
                                const arr = [...d.experience]
                                ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
                                return { ...d, experience: arr }
                              })
                            }
                          >
                            <ArrowUp className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={idx === resume.experience.length - 1}
                            onClick={() =>
                              setResume((d) => {
                                const arr = [...d.experience]
                                ;[arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]]
                                return { ...d, experience: arr }
                              })
                            }
                          >
                            <ArrowDown className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setResume((d) => ({ ...d, experience: d.experience.filter((x) => x.id !== exp.id) }))
                            }
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Job Title"
                          value={exp.role}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              experience: d.experience.map((x) => (x.id === exp.id ? { ...x, role: e.target.value } : x)),
                            }))
                          }
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="Company"
                          value={exp.company}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              experience: d.experience.map((x) =>
                                x.id === exp.id ? { ...x, company: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="Period (e.g. 2022 – Present)"
                          value={exp.period}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              experience: d.experience.map((x) =>
                                x.id === exp.id ? { ...x, period: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="Location"
                          value={exp.location}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              experience: d.experience.map((x) =>
                                x.id === exp.id ? { ...x, location: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <Textarea
                        rows={3}
                        className="text-xs"
                        placeholder="Achievements (one bullet per line)"
                        value={exp.bullets}
                        onChange={(e) =>
                          setResume((d) => ({
                            ...d,
                            experience: d.experience.map((x) =>
                              x.id === exp.id ? { ...x, bullets: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Education & Projects */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Education</CardTitle>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() =>
                        setResume((d) => ({
                          ...d,
                          education: [
                            ...d.education,
                            { id: String(Date.now()), degree: '', school: '', period: '', details: '' },
                          ],
                        }))
                      }
                    >
                      <Plus className="size-3.5" /> Add
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {resume.education.map((edu) => (
                      <div key={edu.id} className="space-y-1.5 rounded-lg border bg-secondary/20 p-2">
                        <div className="flex gap-1">
                          <Input
                            className="h-7 text-xs"
                            placeholder="Degree"
                            value={edu.degree}
                            onChange={(e) =>
                              setResume((d) => ({
                                ...d,
                                education: d.education.map((x) =>
                                  x.id === edu.id ? { ...x, degree: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setResume((d) => ({ ...d, education: d.education.filter((x) => x.id !== edu.id) }))
                            }
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                        <Input
                          className="h-7 text-xs"
                          placeholder="University / Institution"
                          value={edu.school}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              education: d.education.map((x) =>
                                x.id === edu.id ? { ...x, school: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input
                            className="h-7 text-xs"
                            placeholder="Years"
                            value={edu.period}
                            onChange={(e) =>
                              setResume((d) => ({
                                ...d,
                                education: d.education.map((x) =>
                                  x.id === edu.id ? { ...x, period: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                          <Input
                            className="h-7 text-xs"
                            placeholder="GPA / Honors"
                            value={edu.details}
                            onChange={(e) =>
                              setResume((d) => ({
                                ...d,
                                education: d.education.map((x) =>
                                  x.id === edu.id ? { ...x, details: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">Projects / Certs</CardTitle>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() =>
                        setResume((d) => ({
                          ...d,
                          projects: [...d.projects, { id: String(Date.now()), name: '', link: '', description: '' }],
                        }))
                      }
                    >
                      <Plus className="size-3.5" /> Add
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {resume.projects.map((pr) => (
                      <div key={pr.id} className="space-y-1.5 rounded-lg border bg-secondary/20 p-2">
                        <div className="flex gap-1">
                          <Input
                            className="h-7 text-xs"
                            placeholder="Project / Cert name"
                            value={pr.name}
                            onChange={(e) =>
                              setResume((d) => ({
                                ...d,
                                projects: d.projects.map((x) => (x.id === pr.id ? { ...x, name: e.target.value } : x)),
                              }))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setResume((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== pr.id) }))
                            }
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                        <Input
                          className="h-7 text-xs"
                          placeholder="URL / Credential ID"
                          value={pr.link}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              projects: d.projects.map((x) => (x.id === pr.id ? { ...x, link: e.target.value } : x)),
                            }))
                          }
                        />
                        <Input
                          className="h-7 text-xs"
                          placeholder="Short description"
                          value={pr.description}
                          onChange={(e) =>
                            setResume((d) => ({
                              ...d,
                              projects: d.projects.map((x) =>
                                x.id === pr.id ? { ...x, description: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ───────── CERTIFICATE EDITOR ───────── */}
          {kind === 'certificate' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Certificate Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Issuing Organization</Label>
                    <Input
                      className="h-8 text-xs"
                      value={certificate.organization}
                      onChange={(e) => setCertificate((d) => ({ ...d, organization: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Recipient Full Name</Label>
                    <Input
                      className="h-8 text-xs font-medium"
                      value={certificate.recipientName}
                      onChange={(e) => setCertificate((d) => ({ ...d, recipientName: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Certificate Title</Label>
                  <Input
                    className="h-8 text-xs"
                    value={certificate.title}
                    onChange={(e) => setCertificate((d) => ({ ...d, title: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-1">
                    {CERTIFICATE_TITLE_PRESETS.map((presetTitle) => (
                      <button
                        key={presetTitle}
                        type="button"
                        onClick={() => setCertificate((d) => ({ ...d, title: presetTitle }))}
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
                          certificate.title === presetTitle
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-secondary',
                        )}
                      >
                        {presetTitle.replace('CERTIFICATE OF ', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Course / Award / Event Name</Label>
                  <Input
                    className="h-8 text-xs"
                    value={certificate.courseOrEvent}
                    onChange={(e) => setCertificate((d) => ({ ...d, courseOrEvent: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Citation / Description</Label>
                  <Textarea
                    rows={2}
                    className="text-xs"
                    value={certificate.description}
                    onChange={(e) => setCertificate((d) => ({ ...d, description: e.target.value }))}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Issue Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={certificate.issueDate}
                      onChange={(e) => setCertificate((d) => ({ ...d, issueDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Certificate ID</Label>
                    <div className="flex gap-1">
                      <Input
                        className="h-8 text-xs"
                        value={certificate.certificateId}
                        onChange={(e) => setCertificate((d) => ({ ...d, certificateId: e.target.value }))}
                      />
                      <Button
                        variant="outline"
                        size="icon-xs"
                        className="h-8 w-8 shrink-0"
                        title="Generate random ID"
                        onClick={() =>
                          setCertificate((d) => ({
                            ...d,
                            certificateId: `CERT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`,
                          }))
                        }
                      >
                        <Sparkles className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Left Signatory</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Name"
                      value={certificate.signer1Name}
                      onChange={(e) => setCertificate((d) => ({ ...d, signer1Name: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Title"
                      value={certificate.signer1Title}
                      onChange={(e) => setCertificate((d) => ({ ...d, signer1Title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Right Signatory</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Name"
                      value={certificate.signer2Name}
                      onChange={(e) => setCertificate((d) => ({ ...d, signer2Name: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Title"
                      value={certificate.signer2Title}
                      onChange={(e) => setCertificate((d) => ({ ...d, signer2Title: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ───────── LETTERHEAD EDITOR ───────── */}
          {kind === 'letterhead' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Organization Header &amp; Metadata</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2.5 sm:grid-cols-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Organization name"
                    value={letterhead.companyName}
                    onChange={(e) => setLetterhead((d) => ({ ...d, companyName: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Tagline"
                    value={letterhead.tagline}
                    onChange={(e) => setLetterhead((d) => ({ ...d, tagline: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Address"
                    value={letterhead.companyAddress}
                    onChange={(e) => setLetterhead((d) => ({ ...d, companyAddress: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Email | Phone | Website"
                    value={letterhead.companyContact}
                    onChange={(e) => setLetterhead((d) => ({ ...d, companyContact: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Reference No."
                    value={letterhead.referenceNo}
                    onChange={(e) => setLetterhead((d) => ({ ...d, referenceNo: e.target.value }))}
                  />
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={letterhead.date}
                    onChange={(e) => setLetterhead((d) => ({ ...d, date: e.target.value }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recipient &amp; Letter Body</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Recipient name"
                      value={letterhead.recipientName}
                      onChange={(e) => setLetterhead((d) => ({ ...d, recipientName: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Recipient title"
                      value={letterhead.recipientTitle}
                      onChange={(e) => setLetterhead((d) => ({ ...d, recipientTitle: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Recipient organization"
                      value={letterhead.recipientOrg}
                      onChange={(e) => setLetterhead((d) => ({ ...d, recipientOrg: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Recipient address"
                      value={letterhead.recipientAddress}
                      onChange={(e) => setLetterhead((d) => ({ ...d, recipientAddress: e.target.value }))}
                    />
                  </div>
                  <Input
                    className="h-8 text-xs font-medium"
                    placeholder="Subject line"
                    value={letterhead.subject}
                    onChange={(e) => setLetterhead((d) => ({ ...d, subject: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Salutation (e.g. Dear Mr. Islam,)"
                    value={letterhead.salutation}
                    onChange={(e) => setLetterhead((d) => ({ ...d, salutation: e.target.value }))}
                  />
                  <Textarea
                    rows={7}
                    className="text-xs leading-relaxed"
                    placeholder="Write your official letter…"
                    value={letterhead.body}
                    onChange={(e) => setLetterhead((d) => ({ ...d, body: e.target.value }))}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Closing (e.g. Sincerely,)"
                      value={letterhead.closing}
                      onChange={(e) => setLetterhead((d) => ({ ...d, closing: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Sender name"
                      value={letterhead.senderName}
                      onChange={(e) => setLetterhead((d) => ({ ...d, senderName: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Sender title"
                      value={letterhead.senderTitle}
                      onChange={(e) => setLetterhead((d) => ({ ...d, senderTitle: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT: Sticky Live Paper Preview */}
        <div className="xl:sticky xl:top-4 xl:col-span-6">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Live Paper Preview</span>
                <Badge variant="outline">{kind === 'certificate' ? 'A4 Landscape' : 'A4 Portrait'}</Badge>
              </div>
              <div className="w-44">
                <SmoothSizeSlider
                  size="sm"
                  value={previewZoom}
                  min={45}
                  max={115}
                  step={5}
                  resetValue={kind === 'certificate' ? 62 : 80}
                  formatValue={(v) => `${v}%`}
                  onChange={setPreviewZoom}
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-11rem)] overflow-auto bg-canvas p-5 scrollbar-thin">
              <TemplatePreview
                kind={kind}
                theme={theme}
                invoice={invoice}
                resume={resume}
                certificate={certificate}
                letterhead={letterhead}
                zoom={previewZoom}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
