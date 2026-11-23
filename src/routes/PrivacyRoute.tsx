import * as React from 'react'
import { HardDrive, Trash2, CheckCircle2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { estimateStorage } from '@/lib/storage/db'
import { clearLocalData } from '@/lib/storage/repo'
import { clearPreviewCache } from '@/lib/pdf/render'
import { clearAllCachedModels } from '@/lib/ai/models'
import { formatBytes } from '@/lib/utils/format'

export default function PrivacyRoute() {
  const [storage, setStorage] = React.useState<{ usage: number; quota: number } | null>(null)

  const refresh = React.useCallback(async () => {
    setStorage(await estimateStorage())
  }, [])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const usagePct = storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          PaperFlow AI is designed from the ground up so your PDFs, signatures, and extracted text never leave your browser.
        </p>
      </div>

      {/* Guarantees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-primary" /> How Your Data Is Handled
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {[
            ['Zero PDF uploads', 'All merging, splitting, compression, editing, OCR, and redaction execute locally in browser memory & Web Workers.'],
            ['No external AI APIs', 'No OpenAI, Gemini, or Claude keys. Optional AI models run locally via ONNX Runtime Web / WebGPU / WASM.'],
            ['Transparent downloads', 'The only network requests are optional, user-initiated downloads of open-source OCR language packs or Hugging Face ONNX weights.'],
            ['Local-only storage', 'Recent files, saved projects, and signature presets live strictly in your browser IndexedDB and can be wiped anytime below.'],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-2.5 rounded-lg border p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-foreground">{title}</p>
                <p className="text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Local Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4 text-primary" /> Local Browser Storage
          </CardTitle>
          <CardDescription>
            {storage
              ? `Using ${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} available browser storage`
              : 'Storage estimate unavailable in this browser'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {storage && <Progress value={usagePct} />}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await clearLocalData('temporary')
                await refresh()
                toast.success('Cleared temporary files')
              }}
            >
              Clear Temporary Files
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                clearPreviewCache()
                await clearLocalData('previews')
                await refresh()
                toast.success('Cleared cached previews')
              }}
            >
              Clear Cached Previews
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await clearLocalData('documents')
                await refresh()
                toast.success('Cleared all local documents')
              }}
            >
              Clear Local Documents
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await clearAllCachedModels()
                await refresh()
                toast.success('Cleared cached AI models')
              }}
            >
              Clear AI Models
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="size-3.5" /> Clear All Local Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all PaperFlow local data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all saved documents, projects, signatures, preview caches, and downloaded AI
                    models from this browser.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    destructive
                    onClick={async () => {
                      clearPreviewCache()
                      await Promise.all([clearLocalData('all'), clearAllCachedModels()])
                      localStorage.removeItem('pf-preferences')
                      await refresh()
                      toast.success('All local PaperFlow data wiped')
                    }}
                  >
                    Yes, clear everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
