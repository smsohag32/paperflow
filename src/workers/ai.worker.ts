/// <reference lib="webworker" />
import { env, pipeline, type PipelineType } from '@huggingface/transformers'

// Use local ONNX runtime WASM files copied to /public/vendor/ort
env.allowLocalModels = false
env.useBrowserCache = true
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/vendor/ort/'
}

type WorkerReq =
  | { id: string; type: 'load'; modelId: string; task: 'text-generation' | 'translation' | 'feature-extraction'; device: 'webgpu' | 'wasm'; dtype: string }
  | { id: string; type: 'generate'; modelId: string; messages: { role: string; content: string }[]; maxNewTokens?: number }
  | { id: string; type: 'translate'; modelId: string; text: string; srcLang: string; tgtLang: string }
  | { id: string; type: 'unload'; modelId?: string }

const loaded = new Map<string, { task: string; pipe: unknown }>()

function post(msg: unknown) {
  ;(self as unknown as Worker).postMessage(msg)
}

self.onmessage = async (e: MessageEvent<WorkerReq>) => {
  const req = e.data
  try {
    if (req.type === 'unload') {
      if (req.modelId) {
        const entry = loaded.get(req.modelId)
        if (entry && typeof (entry.pipe as { dispose?: () => Promise<void> }).dispose === 'function') {
          await (entry.pipe as { dispose: () => Promise<void> }).dispose()
        }
        loaded.delete(req.modelId)
      } else {
        for (const entry of loaded.values()) {
          if (typeof (entry.pipe as { dispose?: () => Promise<void> }).dispose === 'function') {
            await (entry.pipe as { dispose: () => Promise<void> }).dispose()
          }
        }
        loaded.clear()
      }
      post({ id: req.id, ok: true })
      return
    }

    if (req.type === 'load') {
      if (!loaded.has(req.modelId)) {
        const pipe = await pipeline(req.task as PipelineType, req.modelId, {
          device: req.device,
          dtype: req.dtype as never,
          progress_callback: (info: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
            post({
              id: req.id,
              type: 'progress',
              status: info.status ?? 'downloading',
              file: info.file,
              progress: typeof info.progress === 'number' ? info.progress / 100 : undefined,
              loaded: info.loaded,
              total: info.total,
            })
          },
        })
        loaded.set(req.modelId, { task: req.task, pipe })
      }
      post({ id: req.id, ok: true })
      return
    }

    if (req.type === 'generate') {
      const entry = loaded.get(req.modelId)
      if (!entry) throw new Error('Model is not loaded yet. Download and load it first.')
      const gen = entry.pipe as (
        messages: { role: string; content: string }[],
        opts: Record<string, unknown>,
      ) => Promise<{ generated_text: string | { role: string; content: string }[] }[]>
      const out = await gen(req.messages, {
        max_new_tokens: req.maxNewTokens ?? 320,
        temperature: 0.35,
        do_sample: true,
        repetition_penalty: 1.1,
      })
      const first = out?.[0]?.generated_text
      let answer = ''
      if (Array.isArray(first)) {
        answer = first[first.length - 1]?.content ?? ''
      } else if (typeof first === 'string') {
        answer = first
      }
      post({ id: req.id, ok: true, text: answer.trim() })
      return
    }

    if (req.type === 'translate') {
      const entry = loaded.get(req.modelId)
      if (!entry) throw new Error('Translation model is not loaded yet.')
      const translator = entry.pipe as (
        text: string,
        opts: { src_lang: string; tgt_lang: string },
      ) => Promise<{ translation_text: string }[]>
      const paragraphs = req.text.split(/\n{2,}/)
      const translated: string[] = []
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i].trim()
        if (!p) {
          translated.push('')
          continue
        }
        const res = await translator(p, { src_lang: req.srcLang, tgt_lang: req.tgtLang })
        translated.push(res?.[0]?.translation_text ?? p)
        post({ id: req.id, type: 'progress', status: 'translating', progress: (i + 1) / paragraphs.length })
      }
      post({ id: req.id, ok: true, text: translated.join('\n\n') })
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
