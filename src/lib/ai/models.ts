import type { AiMode } from '@/stores/preferences'

export type AiTaskKind = 'chat' | 'translation' | 'embeddings'

export interface LocalModelSpec {
  id: string
  name: string
  task: AiTaskKind
  tier: AiMode
  sizeLabel: string
  sizeBytes: number
  ramEstimate: string
  license: string
  licenseUrl: string
  description: string
  supportedTasks: string[]
  webgpuSupported: boolean
  wasmSupported: boolean
  dtypeWebGPU: 'q4f16' | 'q4' | 'q8'
  dtypeWasm: 'q4' | 'q8'
}

/**
 * Verified open-source Hugging Face ONNX models compatible with Transformers.js in browser.
 * All models are downloaded ONLY on explicit user action and cached locally in browser Cache Storage.
 */
export const LOCAL_MODELS: LocalModelSpec[] = [
  {
    id: 'onnx-community/SmolLM2-360M-Instruct',
    name: 'SmolLM2 360M Instruct',
    task: 'chat',
    tier: 'light',
    sizeLabel: '~230 MB',
    sizeBytes: 230_000_000,
    ramEstimate: '~700 MB RAM',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct',
    description: 'Ultra-light instruction model by Hugging Face. Fast on CPU/WASM and low-memory laptops.',
    supportedTasks: ['Summarize', 'Q&A', 'Key points', 'Study notes', 'Rewrite'],
    webgpuSupported: true,
    wasmSupported: true,
    dtypeWebGPU: 'q4f16',
    dtypeWasm: 'q4',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 0.5B Instruct',
    task: 'chat',
    tier: 'balanced',
    sizeLabel: '~480 MB',
    sizeBytes: 480_000_000,
    ramEstimate: '~1.2 GB RAM',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct',
    description: 'Strong instruction following, structured extraction, FAQs, quizzes, and multilingual understanding.',
    supportedTasks: ['Summarize', 'Q&A', 'Structured extraction', 'Flashcards & Quizzes', 'Resume review'],
    webgpuSupported: true,
    wasmSupported: true,
    dtypeWebGPU: 'q4f16',
    dtypeWasm: 'q4',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 1.5B Instruct',
    task: 'chat',
    tier: 'advanced',
    sizeLabel: '~1.1 GB',
    sizeBytes: 1_100_000_000,
    ramEstimate: '~2.5 GB RAM (WebGPU recommended)',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct',
    description: 'Higher-quality reasoning and long-form document synthesis. Best on WebGPU-capable devices.',
    supportedTasks: ['Deep Q&A', 'Complex summaries', 'Professional rewrite', 'Resume optimization'],
    webgpuSupported: true,
    wasmSupported: true,
    dtypeWebGPU: 'q4f16',
    dtypeWasm: 'q4',
  },
  {
    id: 'Xenova/m2m100_418M',
    name: 'M2M100 418M (100 Languages)',
    task: 'translation',
    tier: 'balanced',
    sizeLabel: '~470 MB',
    sizeBytes: 470_000_000,
    ramEstimate: '~1.2 GB RAM',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/Xenova/m2m100_418M',
    description: 'Meta open-source multilingual translation supporting English ↔ Bangla and 98 more languages locally.',
    supportedTasks: ['English ↔ Bangla', '100+ languages', 'Paragraph translation'],
    webgpuSupported: false,
    wasmSupported: true,
    dtypeWebGPU: 'q8',
    dtypeWasm: 'q8',
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM-L6-v2 Embeddings',
    task: 'embeddings',
    tier: 'light',
    sizeLabel: '~23 MB',
    sizeBytes: 23_000_000,
    ramEstimate: '~120 MB RAM',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2',
    description: 'Tiny local sentence embeddings for semantic retrieval across long PDFs.',
    supportedTasks: ['Semantic search', 'RAG chunk retrieval'],
    webgpuSupported: true,
    wasmSupported: true,
    dtypeWebGPU: 'q8',
    dtypeWasm: 'q8',
  },
]

export const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bangla (বাংলা)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
] as const

const CACHE_NAME = 'transformers-cache'

/** Inspect which models currently have cached files in Browser Cache Storage. */
export async function getCachedModelIds(): Promise<Set<string>> {
  const cached = new Set<string>()
  if (typeof caches === 'undefined') return cached
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    for (const model of LOCAL_MODELS) {
      if (keys.some((req) => req.url.includes(model.id))) {
        cached.add(model.id)
      }
    }
  } catch {
    /* ignore */
  }
  return cached
}

/** Delete all cached weights for a specific model from Cache Storage. */
export async function removeCachedModel(modelId: string): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  let removed = 0
  for (const req of keys) {
    if (req.url.includes(modelId)) {
      await cache.delete(req)
      removed++
    }
  }
  return removed
}

/** Delete the entire Transformers.js local model cache. */
export async function clearAllCachedModels(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(CACHE_NAME)
}
