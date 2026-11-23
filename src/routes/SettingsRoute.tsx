import * as React from 'react'
import { Cpu, Gauge, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/radio'
import { SimpleSelect } from '@/components/ui/select'
import { Badge } from '@/components/ui/misc'
import { usePreferences, type AiAcceleration, type Quality } from '@/stores/preferences'
import { detectCapabilities } from '@/lib/performance/device'
import { useProfile } from '@/lib/performance/profile'
import { clearPreviewCache } from '@/lib/pdf/render'
import { clearAllCachedModels } from '@/lib/ai/models'
import { clearLocalData } from '@/lib/storage/repo'
import type { PerformanceMode, ThemeMode } from '@/types/common'

export default function SettingsRoute() {
  const pref = usePreferences()
  const caps = React.useMemo(() => detectCapabilities(), [])
  const profile = useProfile()

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings &amp; Performance</h1>
        <p className="text-sm text-muted-foreground">
          Tune PaperFlow AI for your device. Defaults adapt automatically to low-memory and low-end hardware.
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance &amp; Accessibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">Choose Light, Dark, or follow your OS</p>
            </div>
            <Segmented
              size="sm"
              value={pref.theme}
              onValueChange={(v) => pref.set({ theme: v as ThemeMode })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Reduce animations</Label>
              <p className="text-xs text-muted-foreground">Minimize motion and save GPU cycles</p>
            </div>
            <Switch checked={pref.reduceMotion} onCheckedChange={(reduceMotion) => pref.set({ reduceMotion })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Autosave workspace</Label>
              <p className="text-xs text-muted-foreground">Automatically recover your open PDF workspace after refresh</p>
            </div>
            <Switch checked={pref.autosave} onCheckedChange={(autosave) => pref.set({ autosave })} />
          </div>
        </CardContent>
      </Card>

      {/* Performance Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" /> Performance Profile
          </CardTitle>
          <CardDescription>
            Active profile: <Badge variant="primary" className="ml-1 uppercase">{profile.name}</Badge> · Max DPR{' '}
            {profile.maxDpr}× · Render concurrency {profile.renderConcurrency} · Thumbnail cache {profile.thumbCacheSize}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>Performance mode</Label>
            <Segmented
              size="sm"
              value={pref.performanceMode}
              onValueChange={(v) => pref.set({ performanceMode: v as PerformanceMode })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'low', label: 'Low Memory' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Preview quality</Label>
              <SimpleSelect
                size="sm"
                value={pref.previewQuality}
                onValueChange={(v) => pref.set({ previewQuality: v as Quality })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'low', label: 'Low (Fastest)' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <div className="space-y-1">
              <Label>Thumbnail quality</Label>
              <SimpleSelect
                size="sm"
                value={pref.thumbnailQuality}
                onValueChange={(v) => pref.set({ thumbnailQuality: v as Quality })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <div className="space-y-1">
              <Label>AI Acceleration</Label>
              <SimpleSelect
                size="sm"
                value={pref.aiAcceleration}
                onValueChange={(v) => pref.set({ aiAcceleration: v as AiAcceleration })}
                options={[
                  { value: 'auto', label: 'Auto (WebGPU → WASM)' },
                  { value: 'webgpu', label: 'Prefer WebGPU' },
                  { value: 'wasm', label: 'CPU / WASM only' },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Battery-saving mode</Label>
              <p className="text-xs text-muted-foreground">Sequential rendering, zero prefetch, reduced animations</p>
            </div>
            <Switch checked={pref.batterySaver} onCheckedChange={(batterySaver) => pref.set({ batterySaver })} />
          </div>
        </CardContent>
      </Card>

      {/* Detected Hardware */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" /> Detected Device Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg border p-2.5">
            <p className="text-muted-foreground">CPU Threads</p>
            <p className="mt-0.5 font-semibold">{caps.cores}</p>
          </div>
          <div className="rounded-lg border p-2.5">
            <p className="text-muted-foreground">Device Memory</p>
            <p className="mt-0.5 font-semibold">{caps.memoryGB ? `${caps.memoryGB} GB` : 'Not exposed'}</p>
          </div>
          <div className="rounded-lg border p-2.5">
            <p className="text-muted-foreground">WebGPU / WebGL</p>
            <p className="mt-0.5 font-semibold">
              {caps.webgpu ? 'WebGPU' : caps.webgl ? 'WebGL only' : 'CPU only'}
            </p>
          </div>
          <div className="rounded-lg border p-2.5">
            <p className="text-muted-foreground">WASM SIMD</p>
            <p className="mt-0.5 font-semibold">{caps.wasmSimd ? 'Supported' : caps.wasm ? 'Basic WASM' : 'No'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Cache & Reset */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance &amp; Caches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearPreviewCache()
              clearLocalData('previews').catch(() => {})
              toast.success('Preview cache cleared')
            }}
          >
            <Trash2 className="size-3.5" /> Clear Preview Cache
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await clearAllCachedModels()
              toast.success('AI model cache cleared')
            }}
          >
            <Trash2 className="size-3.5" /> Clear AI Models
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await clearLocalData('temporary')
              toast.success('Temporary files cleared')
            }}
          >
            <Trash2 className="size-3.5" /> Clear Temporary Files
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              pref.reset()
              toast.success('Preferences reset to defaults')
            }}
          >
            <RotateCcw className="size-3.5" /> Reset Preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
