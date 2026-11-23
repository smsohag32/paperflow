import { uid } from '@/lib/utils/id'
import { probeWebGPU } from '@/lib/performance/device'
import { LOCAL_MODELS, type LocalModelSpec } from './models'
import { usePreferences } from '@/stores/preferences'

export interface AiProgressEvent {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

class LocalAiClient {
  private worker: Worker | null = null
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: AiProgressEvent) => void }
  >()
  loadedModels = new Set<string>()

  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('../../workers/ai.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ id: string; type?: string; ok?: boolean; text?: string; error?: string } & AiProgressEvent>) => {
        const msg = e.data
        const entry = this.pending.get(msg.id)
        if (!entry) return
        if (msg.type === 'progress') {
          entry.onProgress?.({
            status: msg.status,
            file: msg.file,
            progress: msg.progress,
            loaded: msg.loaded,
            total: msg.total,
          })
          return
        }
        this.pending.delete(msg.id)
        if (msg.ok) entry.resolve(msg.text ?? true)
        else entry.reject(new Error(msg.error || 'Local AI inference failed'))
      }
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'AI worker crashed'))
        this.pending.clear()
        this.loadedModels.clear()
        this.worker = null
      }
    }
    return this.worker
  }

  private call<T>(payload: Record<string, unknown>, onProgress?: (p: AiProgressEvent) => void): Promise<T> {
    const id = uid('ai')
    const w = this.ensureWorker()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      w.postMessage({ ...payload, id })
    })
  }

  /** Abort all in-flight AI work by terminating the worker cleanly. */
  cancelAll() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    for (const p of this.pending.values()) p.reject(new Error('Cancelled'))
    this.pending.clear()
    this.loadedModels.clear()
  }

  async loadModel(modelId: string, onProgress?: (p: AiProgressEvent) => void): Promise<void> {
    const spec = LOCAL_MODELS.find((m) => m.id === modelId)
    if (!spec) throw new Error(`Unknown model: ${modelId}`)
    const accel = usePreferences.getState().aiAcceleration
    let device: 'webgpu' | 'wasm' = 'wasm'
    if (spec.webgpuSupported && accel !== 'wasm') {
      const gpu = await probeWebGPU()
      if (gpu.ok) device = 'webgpu'
    }
    const dtype = device === 'webgpu' ? spec.dtypeWebGPU : spec.dtypeWasm
    const task =
      spec.task === 'translation'
        ? 'translation'
        : spec.task === 'embeddings'
          ? 'feature-extraction'
          : 'text-generation'
    await this.call({ type: 'load', modelId, task, device, dtype }, onProgress)
    this.loadedModels.add(modelId)
  }

  async generate(
    modelId: string,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    maxNewTokens = 320,
  ): Promise<string> {
    if (!this.loadedModels.has(modelId)) await this.loadModel(modelId)
    return this.call<string>({ type: 'generate', modelId, messages, maxNewTokens })
  }

  async translate(
    modelId: string,
    text: string,
    srcLang: string,
    tgtLang: string,
    onProgress?: (p: AiProgressEvent) => void,
  ): Promise<string> {
    if (!this.loadedModels.has(modelId)) await this.loadModel(modelId, onProgress)
    return this.call<string>({ type: 'translate', modelId, text, srcLang, tgtLang }, onProgress)
  }

  async unload(modelId?: string) {
    if (!this.worker) return
    await this.call({ type: 'unload', modelId })
    if (modelId) this.loadedModels.delete(modelId)
    else this.loadedModels.clear()
  }
}

export const aiClient = new LocalAiClient()

/* ────────────── Document chunking & retrieval (RAG) ────────────── */

export interface TextChunk {
  index: number
  pageIndex?: number
  text: string
}

/** Split long document text into overlapping chunks sized for small local LLM context windows. */
export function chunkDocument(pages: { pageIndex: number; text: string }[], chunkSize = 1100, overlap = 150): TextChunk[] {
  const chunks: TextChunk[] = []
  let idx = 0
  for (const p of pages) {
    const clean = p.text.replace(/\s+/g, ' ').trim()
    if (!clean) continue
    let start = 0
    while (start < clean.length) {
      const end = Math.min(clean.length, start + chunkSize)
      chunks.push({ index: idx++, pageIndex: p.pageIndex, text: clean.slice(start, end) })
      if (end >= clean.length) break
      start = end - overlap
    }
  }
  return chunks
}

/** Fast local BM25-style lexical retrieval to pick the top-K relevant chunks for a question. */
export function retrieveRelevantChunks(chunks: TextChunk[], query: string, k = 3): TextChunk[] {
  if (chunks.length <= k) return chunks
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/)
    .filter((w) => w.length > 2)
  if (terms.length === 0) return chunks.slice(0, k)

  const scored = chunks.map((chunk) => {
    const lower = chunk.text.toLowerCase()
    let score = 0
    for (const t of terms) {
      const matches = lower.split(t).length - 1
      if (matches > 0) score += 1 + Math.log(1 + matches)
    }
    return { chunk, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k).map((s) => s.chunk)
}

/* ────────────── Instant Zero-Download Local Intelligence ────────────── */

export interface StructuredExtraction {
  dates: string[]
  emails: string[]
  phones: string[]
  amounts: string[]
  urls: string[]
  keySentences: string[]
}

/** Instant deterministic extraction of dates, contacts, amounts, and key sentences (no model required). */
export function extractStructuredEntities(text: string): StructuredExtraction {
  const uniq = (arr: string[]) => [...new Set(arr.map((s) => s.trim()))].slice(0, 40)
  const emails = uniq(text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [])
  const phones = uniq(text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g) ?? [])
  const dates = uniq(
    text.match(
      /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b/gi,
    ) ?? [],
  )
  const amounts = uniq(text.match(/(?:[$€£¥৳]|USD|EUR|GBP|BDT)\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? [])
  const urls = uniq(text.match(/https?:\/\/[^\s)>,]+/gi) ?? [])

  // Extractive TextRank-lite: score sentences by word frequency
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 35 && s.length < 320)
  const freq = new Map<string, number>()
  for (const w of text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []) {
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  const scored = sentences.map((s, idx) => {
    const words = s.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
    const score = words.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.max(1, words.length)
    return { s, idx, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const keySentences = scored
    .slice(0, 6)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.s)

  return { dates, emails, phones, amounts, urls, keySentences }
}

export interface ResumeAudit {
  detectedSections: string[]
  missingSections: string[]
  wordCount: number
  hasContact: boolean
  hasMetrics: boolean
  matchedKeywords: string[]
  missingKeywords: string[]
  matchScore: number | null
  suggestions: string[]
  suggestedFilename: string
}

const RESUME_SECTIONS = [
  { name: 'Contact Info', pattern: /@|phone|linkedin|github/i },
  { name: 'Summary / Objective', pattern: /\b(summary|profile|objective|about me)\b/i },
  { name: 'Experience', pattern: /\b(experience|employment|work history|career)\b/i },
  { name: 'Education', pattern: /\b(education|university|degree|bachelor|master|b\.sc|m\.sc)\b/i },
  { name: 'Skills', pattern: /\b(skills|technologies|competencies|tools)\b/i },
  { name: 'Projects', pattern: /\b(projects|portfolio)\b/i },
]

/**
 * Local Resume & Job Description Analyzer.
 * Never fabricates experience or personal details — only audits what is actually present.
 */
export function analyzeResume(resumeText: string, jobDescription = '', fileSizeBytes = 0): ResumeAudit {
  const detectedSections: string[] = []
  const missingSections: string[] = []
  for (const sec of RESUME_SECTIONS) {
    if (sec.pattern.test(resumeText)) detectedSections.push(sec.name)
    else missingSections.push(sec.name)
  }

  const words = resumeText.trim().split(/\s+/).filter(Boolean)
  const hasContact = /@/.test(resumeText)
  const hasMetrics = /\b\d+(?:%|\+|x|k|m|\s*(?:years|months|users|clients))\b/i.test(resumeText)
  const suggestions: string[] = []

  if (!hasContact) suggestions.push('Include a clear email address in your contact header.')
  if (!hasMetrics) suggestions.push('Quantify achievements with real numbers (e.g., percentages, time saved, team size) where truthful.')
  if (words.length < 180) suggestions.push('Resume text looks very short — verify if it is a scanned image that needs OCR.')
  if (words.length > 1100) suggestions.push('Consider tightening bullet points so recruiters can scan it in 1–2 pages.')
  if (fileSizeBytes > 2_000_000) suggestions.push('File is over 2 MB — use Compression Studio so it uploads smoothly to job portals.')
  if (missingSections.includes('Skills')) suggestions.push('Add a dedicated Skills section for clearer ATS scanning.')

  let matchedKeywords: string[] = []
  let missingKeywords: string[] = []
  let matchScore: number | null = null

  if (jobDescription.trim().length > 20) {
    const stop = new Set([
      'with', 'that', 'this', 'from', 'your', 'have', 'will', 'work', 'team', 'role', 'about',
      'their', 'more', 'years', 'experience', 'strong', 'skills', 'ability', 'using', 'must', 'should',
    ])
    const jdWords = [...new Set((jobDescription.toLowerCase().match(/\b[a-z][a-z0-9+#.-]{2,}\b/g) ?? []).filter((w) => !stop.has(w)))]
    const resLower = resumeText.toLowerCase()
    matchedKeywords = jdWords.filter((w) => resLower.includes(w)).slice(0, 30)
    missingKeywords = jdWords.filter((w) => !resLower.includes(w)).slice(0, 25)
    const denom = matchedKeywords.length + missingKeywords.length
    matchScore = denom > 0 ? Math.round((matchedKeywords.length / denom) * 100) : null
  }

  const firstLine = resumeText.split('\n').map((l) => l.trim()).find((l) => l.length > 2 && l.length < 50 && !l.includes('@')) ?? 'Candidate'
  const cleanName = firstLine.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate'
  const suggestedFilename = `${cleanName}_Resume.pdf`

  return {
    detectedSections,
    missingSections,
    wordCount: words.length,
    hasContact,
    hasMetrics,
    matchedKeywords,
    missingKeywords,
    matchScore,
    suggestions,
    suggestedFilename,
  }
}

export function getRecommendedModel(tier: LocalModelSpec['tier'], task: LocalModelSpec['task'] = 'chat') {
  return (
    LOCAL_MODELS.find((m) => m.task === task && m.tier === tier) ??
    LOCAL_MODELS.find((m) => m.task === task) ??
    LOCAL_MODELS[0]
  )
}
