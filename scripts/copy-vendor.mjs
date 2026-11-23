// Copies runtime WASM/worker assets into /public/vendor so the app can run
// fully offline after first load (no CDN required for OCR engine / ONNX runtime).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'vendor')

function copyDir(from, to, filter = () => true) {
  if (!existsSync(from)) {
    console.warn(`[copy-vendor] skipped missing ${from}`)
    return
  }
  mkdirSync(to, { recursive: true })
  for (const f of readdirSync(from)) {
    if (filter(f)) cpSync(join(from, f), join(to, f), { recursive: true })
  }
}

// Tesseract.js worker + core (WASM)
copyDir(join(nm, 'tesseract.js', 'dist'), join(out, 'tesseract'), (f) => f.startsWith('worker.min.js'))
copyDir(join(nm, 'tesseract.js-core'), join(out, 'tesseract-core'), (f) =>
  /^tesseract-core.*\.(js|wasm)$/.test(f),
)

// ONNX Runtime Web WASM binaries used by Transformers.js
copyDir(join(nm, 'onnxruntime-web', 'dist'), join(out, 'ort'), (f) => /^ort-wasm.*\.(wasm|mjs)$/.test(f))

console.log('[copy-vendor] done')
