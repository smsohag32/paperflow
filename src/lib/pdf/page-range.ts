/**
 * Parse human page-range expressions like "1-3, 5, 8-" into zero-based indices.
 * Supports: single pages, ranges, open ranges ("5-" / "-3"), "odd", "even", "last".
 */
export class PageRangeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PageRangeError'
  }
}

export function parsePageRange(input: string, pageCount: number, opts: { unique?: boolean } = {}): number[] {
  const unique = opts.unique ?? true
  const text = input.trim().toLowerCase()
  if (!text) throw new PageRangeError('Enter at least one page.')
  const out: number[] = []
  for (const raw of text.split(/[,;\s]+/).filter(Boolean)) {
    if (raw === 'all') {
      for (let i = 0; i < pageCount; i++) out.push(i)
      continue
    }
    if (raw === 'odd' || raw === 'even') {
      for (let i = raw === 'odd' ? 0 : 1; i < pageCount; i += 2) out.push(i)
      continue
    }
    const part = raw.replace(/last/g, String(pageCount))
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part)
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1
      const b = m[2] ? parseInt(m[2], 10) : pageCount
      if (a < 1 || b < 1 || a > pageCount || b > pageCount)
        throw new PageRangeError(`"${raw}" is outside 1–${pageCount}.`)
      const step = a <= b ? 1 : -1
      for (let i = a; step > 0 ? i <= b : i >= b; i += step) out.push(i - 1)
      continue
    }
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10)
      if (n < 1 || n > pageCount) throw new PageRangeError(`Page ${n} doesn't exist (1–${pageCount}).`)
      out.push(n - 1)
      continue
    }
    throw new PageRangeError(`Couldn't understand "${raw}". Use formats like 1-3, 5, 8-.`)
  }
  if (!unique) return out
  return [...new Set(out)]
}

/** Parse "1-3, 4-6" into groups (each range becomes its own output document). */
export function parseRangeGroups(input: string, pageCount: number): number[][] {
  const groups = input
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!groups.length) throw new PageRangeError('Enter at least one range.')
  return groups.map((g) => parsePageRange(g, pageCount, { unique: false }))
}

/** Format indices back to a compact human range string. */
export function formatPageRange(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const parts: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    parts.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`)
    i = j + 1
  }
  return parts.join(', ')
}
