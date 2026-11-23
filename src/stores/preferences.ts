import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PerformanceMode, ThemeMode } from '@/types/common'

export type Quality = 'auto' | 'low' | 'medium' | 'high'
export type AiMode = 'light' | 'balanced' | 'advanced'
export type AiAcceleration = 'auto' | 'webgpu' | 'wasm'

export interface PreferencesState {
  theme: ThemeMode
  sidebarCollapsed: boolean
  performanceMode: PerformanceMode
  previewQuality: Quality
  thumbnailQuality: Quality
  /** 0 = automatic */
  cacheLimit: number
  /** 0 = automatic */
  workerConcurrency: number
  aiAcceleration: AiAcceleration
  aiMode: AiMode
  aiMemory: 'low' | 'normal'
  backgroundProcessing: boolean
  reduceMotion: boolean
  batterySaver: boolean
  autosave: boolean
  favoriteTools: string[]
  recentTools: string[]
  preferredModels: Record<string, string>
  ocrLanguages: string[]
  exportNamePattern: string
  set: (patch: Partial<Omit<PreferencesState, 'set' | 'toggleFavorite' | 'pushRecentTool' | 'reset'>>) => void
  toggleFavorite: (toolId: string) => void
  pushRecentTool: (toolId: string) => void
  reset: () => void
}

const defaults = {
  theme: 'system' as ThemeMode,
  sidebarCollapsed: false,
  performanceMode: 'auto' as PerformanceMode,
  previewQuality: 'auto' as Quality,
  thumbnailQuality: 'auto' as Quality,
  cacheLimit: 0,
  workerConcurrency: 0,
  aiAcceleration: 'auto' as AiAcceleration,
  aiMode: 'light' as AiMode,
  aiMemory: 'normal' as const,
  backgroundProcessing: true,
  reduceMotion: false,
  batterySaver: false,
  autosave: true,
  favoriteTools: ['merge', 'compress', 'sign', 'ocr'],
  recentTools: [] as string[],
  preferredModels: {} as Record<string, string>,
  ocrLanguages: ['eng'],
  exportNamePattern: '{name}-{tool}',
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set(patch),
      toggleFavorite: (id) =>
        set((s) => ({
          favoriteTools: s.favoriteTools.includes(id)
            ? s.favoriteTools.filter((t) => t !== id)
            : [...s.favoriteTools, id],
        })),
      pushRecentTool: (id) =>
        set((s) => ({ recentTools: [id, ...s.recentTools.filter((t) => t !== id)].slice(0, 8) })),
      reset: () => set({ ...defaults }),
    }),
    { name: 'pf-preferences', version: 1 },
  ),
)
