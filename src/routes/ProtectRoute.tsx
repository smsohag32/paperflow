import * as React from 'react'
import { Lock, Unlock, ShieldAlert, EyeOff, FileText, Download, Trash2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/misc'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import {
  applyPermanentRedaction,
  detectSensitiveInfo,
  encryptPdf,
  inspectMetadata,
  stripMetadata,
  unlockPdf,
  updateMetadata,
  type PdfMetadataInfo,
  type SensitiveMatch,
} from '@/lib/security/security'
import { downloadBlob, pdfBlob } from '@/lib/utils/download'
import { withSuffix } from '@/lib/utils/format'

export default function ProtectRoute() {
  const [file, setFile] = React.useState<File | null>(null)
  const [meta, setMeta] = React.useState<PdfMetadataInfo | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Encrypt
  const [userPw, setUserPw] = React.useState('')
  const [ownerPw, setOwnerPw] = React.useState('')
  const [allowPrinting, setAllowPrinting] = React.useState(true)
  const [allowCopying, setAllowCopying] = React.useState(false)

  // Unlock
  const [unlockPw, setUnlockPw] = React.useState('')

  // Redact & PII
  const [piiMatches, setPiiMatches] = React.useState<SensitiveMatch[]>([])
  const [selectedTerms, setSelectedTerms] = React.useState<Set<string>>(new Set())
  const [customTerms, setCustomTerms] = React.useState('')
  const [redactProgress, setRedactProgress] = React.useState<number | null>(null)

  const handleFile = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setPiiMatches([])
    setSelectedTerms(new Set())
    try {
      const m = await inspectMetadata(f)
      setMeta(m)
    } catch {
      setMeta(null)
    }
  }

  const handleEncrypt = async () => {
    if (!file || !userPw) return
    setBusy(true)
    try {
      const bytes = await encryptPdf(file, {
        userPassword: userPw,
        ownerPassword: ownerPw || userPw,
        algorithm: 'AES-256',
        allowPrinting,
        allowCopying,
      })
      downloadBlob(pdfBlob(bytes), withSuffix(file.name, '-protected', 'pdf'))
      toast.success('Encrypted PDF with AES-256')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Encryption failed')
    } finally {
      setBusy(false)
    }
  }

  const handleUnlock = async () => {
    if (!file || !unlockPw) return
    setBusy(true)
    try {
      const bytes = await unlockPdf(file, unlockPw)
      downloadBlob(pdfBlob(bytes), withSuffix(file.name, '-unlocked', 'pdf'))
      toast.success('Unlocked PDF downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Incorrect password or unsupported encryption')
    } finally {
      setBusy(false)
    }
  }

  const handleScanPii = async () => {
    if (!file) return
    setBusy(true)
    try {
      const extra = customTerms
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const found = await detectSensitiveInfo(file, { customTerms: extra })
      setPiiMatches(found)
      setSelectedTerms(new Set(found.map((m) => m.value)))
      toast.success(found.length ? `Found ${found.length} sensitive item(s) to review` : 'No common sensitive patterns found')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setBusy(false)
    }
  }

  const handleApplyRedaction = async () => {
    if (!file) return
    const terms = [
      ...selectedTerms,
      ...customTerms
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]
    if (terms.length === 0) {
      toast.info('Select at least one detected item or enter a custom term to redact.')
      return
    }
    setRedactProgress(0.05)
    try {
      const res = await applyPermanentRedaction(file, {
        terms,
        onProgress: (p) => setRedactProgress(p),
      })
      downloadBlob(pdfBlob(res.bytes), withSuffix(file.name, '-redacted', 'pdf'))
      toast.success(
        `Permanently redacted ${res.boxesApplied} region(s) across ${res.redactedPages.length} page(s)`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redaction failed')
    } finally {
      setRedactProgress(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security &amp; Permanent Redaction</h1>
          <p className="text-sm text-muted-foreground">
            AES-256 encryption, authorized unlocking, metadata sanitization, and genuine permanent redaction.
          </p>
        </div>
      </div>

      {!file ? (
        <FileDropzone onFiles={handleFile} title="Drop a PDF to protect, unlock, or redact" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {meta ? `${meta.pageCount} pages` : 'Password-protected or unreadable without unlock'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFile(null)}>
              Change file
            </Button>
          </div>

          <Tabs defaultValue="redact">
            <TabsList className="flex-wrap">
              <TabsTrigger value="redact">
                <EyeOff className="size-3.5" /> Redact &amp; PII Scan
              </TabsTrigger>
              <TabsTrigger value="encrypt">
                <Lock className="size-3.5" /> Encrypt (AES-256)
              </TabsTrigger>
              <TabsTrigger value="unlock">
                <Unlock className="size-3.5" /> Unlock
              </TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            {/* Permanent Redaction */}
            <TabsContent value="redact" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sensitive Info Detection &amp; Permanent Redaction</CardTitle>
                  <CardDescription>
                    Affected pages are rasterized and redacted areas are permanently burned out so underlying text
                    cannot be copied or recovered.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Custom words/phrases to redact (comma-separated)</Label>
                    <Input
                      value={customTerms}
                      onChange={(e) => setCustomTerms(e.target.value)}
                      placeholder="e.g. John Doe, Account #12345, Confidential"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy} onClick={handleScanPii}>
                      <ShieldAlert className="size-4" /> Scan for Emails, Phones, Cards &amp; IDs
                    </Button>
                    <Button disabled={redactProgress !== null} onClick={handleApplyRedaction}>
                      <EyeOff className="size-4" /> Apply Permanent Redaction
                    </Button>
                  </div>

                  {redactProgress !== null && <Progress value={redactProgress * 100} />}

                  {piiMatches.length > 0 && (
                    <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                      {piiMatches.map((m) => {
                        const checked = selectedTerms.has(m.value)
                        return (
                          <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => {
                                setSelectedTerms((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(m.value)) next.delete(m.value)
                                  else next.add(m.value)
                                  return next
                                })
                              }}
                            />
                            <Badge variant="outline" className="uppercase">
                              {m.kind}
                            </Badge>
                            <span className="font-mono">{m.preview}</span>
                            <span className="ml-auto text-muted-foreground">Page {m.pageIndex + 1}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Encrypt */}
            <TabsContent value="encrypt" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Password Protection (AES-256)</CardTitle>
                  <CardDescription>Uses ISO 32000-2 AES-256 encryption locally in your browser.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Open password (required)</Label>
                      <Input type="password" value={userPw} onChange={(e) => setUserPw(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Owner password (optional)</Label>
                      <Input type="password" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={allowPrinting} onCheckedChange={setAllowPrinting} /> Allow printing
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={allowCopying} onCheckedChange={setAllowCopying} /> Allow copying text
                    </label>
                  </div>
                  <Button disabled={!userPw || busy} onClick={handleEncrypt}>
                    <Lock className="size-4" /> Encrypt &amp; Download PDF
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Unlock */}
            <TabsContent value="unlock" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Unlock PDF (Authorized)</CardTitle>
                  <CardDescription>
                    Enter the valid password to export an unencrypted copy. PaperFlow never bypasses unknown passwords.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="max-w-sm space-y-1.5">
                    <Label>Current PDF password</Label>
                    <Input type="password" value={unlockPw} onChange={(e) => setUnlockPw(e.target.value)} />
                  </div>
                  <Button disabled={!unlockPw || busy} onClick={handleUnlock}>
                    <Unlock className="size-4" /> Unlock &amp; Download
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Metadata */}
            <TabsContent value="metadata" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Inspect, Edit, or Strip Metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {meta ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(['title', 'author', 'subject', 'keywords'] as const).map((field) => (
                          <div key={field} className="space-y-1">
                            <Label className="capitalize">{field}</Label>
                            <Input
                              value={meta[field]}
                              onChange={(e) => setMeta({ ...meta, [field]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy}
                          onClick={async () => {
                            const bytes = await updateMetadata(file, meta)
                            downloadBlob(pdfBlob(bytes), withSuffix(file.name, '-meta', 'pdf'))
                            toast.success('Updated metadata saved')
                          }}
                        >
                          <CheckCircle2 className="size-4" /> Save Updated Metadata
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={async () => {
                            const bytes = await stripMetadata(file)
                            downloadBlob(pdfBlob(bytes), withSuffix(file.name, '-stripped', 'pdf'))
                            toast.success('All metadata stripped')
                          }}
                        >
                          <Trash2 className="size-4" /> Strip All Metadata
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Unlock this PDF first to inspect or modify its metadata.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
