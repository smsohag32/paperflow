export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`
}

export function formatPercent(ratio: number, digits = 0) {
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`
  return new Date(ts).toLocaleDateString()
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/** Strip extension */
export function baseName(name: string) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function withSuffix(name: string, suffix: string, ext?: string) {
  const b = baseName(name)
  const e = ext ?? (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'pdf')
  return `${b}${suffix}.${e}`
}

/** Make a string safe to use as a filename on all platforms. */
export function sanitizeFileName(name: string, fallback = 'document') {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return cleaned || fallback
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
