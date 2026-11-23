import { useMemo } from 'react'
import { usePreferences } from '@/stores/preferences'
import { detectCapabilities, resolveProfile, type PerformanceProfile } from './device'

let current: PerformanceProfile | null = null
const listeners = new Set<(p: PerformanceProfile) => void>()

function compute(): PerformanceProfile {
  const s = usePreferences.getState()
  return resolveProfile(s.performanceMode, detectCapabilities(), {
    cacheLimit: s.cacheLimit,
    workerConcurrency: s.workerConcurrency,
    reduceMotion: s.reduceMotion,
    batterySaver: s.batterySaver,
  })
}

/** Non-React access (render queue, batch runner, caches). */
export function getProfile(): PerformanceProfile {
  if (!current) current = compute()
  return current
}

export function onProfileChange(fn: (p: PerformanceProfile) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

usePreferences.subscribe((s, prev) => {
  if (
    s.performanceMode !== prev.performanceMode ||
    s.cacheLimit !== prev.cacheLimit ||
    s.workerConcurrency !== prev.workerConcurrency ||
    s.reduceMotion !== prev.reduceMotion ||
    s.batterySaver !== prev.batterySaver
  ) {
    current = compute()
    listeners.forEach((l) => l(current!))
  }
})

export function useProfile(): PerformanceProfile {
  const mode = usePreferences((s) => s.performanceMode)
  const cacheLimit = usePreferences((s) => s.cacheLimit)
  const wc = usePreferences((s) => s.workerConcurrency)
  const rm = usePreferences((s) => s.reduceMotion)
  const bs = usePreferences((s) => s.batterySaver)
  return useMemo(
    () =>
      resolveProfile(mode, detectCapabilities(), {
        cacheLimit,
        workerConcurrency: wc,
        reduceMotion: rm,
        batterySaver: bs,
      }),
    [mode, cacheLimit, wc, rm, bs],
  )
}
