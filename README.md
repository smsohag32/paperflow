# PaperFlow AI

**A free, privacy-first, AI-powered PDF productivity suite that runs entirely in your browser.**

Zero subscriptions. Zero API keys. Zero cloud uploads. Zero watermarks. Engineered for fast startup and smooth performance even on low-end laptops and 4 GB RAM devices.

---

## Features

- **PDF Workspace (`/workspace`)**: View, reorder pages via drag-and-drop, rotate, duplicate, delete, insert blank pages, crop, add text/highlights/underlines/strikethroughs/freehand drawings/shapes/arrows/sticky notes/images/signatures, configure page numbers, headers/footers, watermarks, undo/redo, autosave & project recovery, and export.
- **Merge PDF (`/merge`)**: Combine multiple PDFs in any order with drag-and-drop sorting.
- **Split & Extract (`/split`)**: Split by custom ranges (`1-3, 4-6`), every N pages, every individual page (ZIP export), or extract specific pages (`odd`, `even`, `last`).
- **Compression Studio (`/compress`)**: Adaptive compression pipeline with presets (`Light`, `Balanced`, `Strong`, `Maximum`, `Custom`), optional target size (`500 KB`, `1 MB`, `2 MB`, `5 MB`, custom), lossless structural optimization first, and transparent quality warnings.
- **Signature Studio (`/sign`)**: Draw signatures with mouse/touch/stylus, upload photos with automatic Canvas pixel background removal (threshold + antialiasing feathering + before/after comparison), save reusable presets in IndexedDB, and export transparent PNGs.
- **Convert Studio (`/convert`)**: Images (JPG/PNG/WebP) ↔ PDF, PDF → Plain Text, Text → PDF, HTML → PDF, and DOCX → PDF (via `mammoth`).
- **OCR & Searchable PDF (`/ocr`)**: Local Tesseract.js OCR with on-demand language downloads (English, Bangla `ben`, Hindi, Arabic, Spanish, French, German, Portuguese, Japanese, Chinese), confidence scores, TXT/JSON export, and searchable PDF generation with invisible text layers.
- **Scan Enhancement Studio (`/enhance`)**: Auto-deskew estimation, background/shadow cleanup, contrast, brightness, sharpen, denoise, grayscale, B&W thresholding, 8 presets (`Document`, `Receipt`, `Certificate`, `ID Card`, `Handwritten Notes`, `Newspaper`, `Book`, `Photo`), and before/after comparison slider.
- **Local AI Workspace (`/ai`)**: Optional, user-initiated open-source models via `@huggingface/transformers` (WebGPU + WASM fallback) running in a dedicated Web Worker:
  - Document Assistant (chunked retrieval Q&A, summaries, bullet points, action items, study notes, flashcards, FAQs) + instant zero-download entity extraction.
  - Local Multilingual Translation (English ↔ Bangla and 8 more languages via `Xenova/m2m100_418M`).
  - Resume & Job Description Analyzer (structural audit, missing sections, keyword overlap — never fabricates details).
  - Dedicated Model Manager with size, license, RAM estimates, download progress, cache status, and removal.
- **Extract & Document Intelligence (`/extract`)**: Full text extraction, spatial table extraction (CSV/JSON), document classification, and page audit (blank pages, duplicates, scanned pages needing OCR, mixed dimensions).
- **Security & Permanent Redaction (`/protect`)**: AES-256 PDF encryption (`@cantoo/pdf-lib`), authorized password unlocking, metadata inspection/editing/stripping, sensitive info detection (emails, phones, Luhn-verified cards, SSNs, IBANs), and genuine permanent redaction (rasterizes affected pages and burns out redacted regions so underlying text cannot be copied or recovered).
- **Batch Processing (`/tools?tab=batch`)**: Bounded-concurrency queue with pause/resume/cancel/retry and ZIP export.
- **Privacy Dashboard (`/privacy`) & Performance Settings (`/settings`)**: Adaptive device profiles (`Auto`, `Low Memory`, `Balanced`, `High`), hardware capability diagnostics, and granular local data clearing.

---

## Tech Stack

- **Core**: React 19, TypeScript (strict), Vite, Tailwind CSS v4, shadcn/ui + Radix UI, Lucide React, React Router, Zustand, Zod
- **PDF & Files**: `pdfjs-dist`, `@cantoo/pdf-lib`, `@dnd-kit`, `fflate` (worker ZIP), `mammoth` (DOCX), `idb` (IndexedDB)
- **Local OCR & AI**: `tesseract.js`, `@huggingface/transformers` (ONNX Runtime Web)
- **Testing & Quality**: Vitest, React Testing Library, Playwright, ESLint, Prettier

---

## Commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
```

Additional useful scripts:
- `npm run typecheck` — Run strict TypeScript check (`tsc -b --noEmit`)
- `npm run preview` — Preview the production build locally
- `npm run test:e2e` — Run Playwright end-to-end smoke tests

---

## Architecture

```text
src/
├── app/
│   ├── config/          # Tool registry & categories
│   ├── layout/          # Collapsible AppShell, header, mobile nav
│   └── router/          # Lazy-loaded routes (code split)
├── components/
│   ├── ui/              # Customized shadcn/ui + Radix primitives
│   ├── shared/          # ErrorBoundary, CommandPalette, Dialogs
│   ├── upload/          # Accessible FileDropzone
│   ├── pdf-viewer/      # On-demand IntersectionObserver PageThumbnail
│   └── editor/          # Interactive PageCanvas with annotation overlays
├── lib/
│   ├── pdf/             # pdfjs loader, shared render queue + LRU cache, ops, export, compress, convert, extract
│   ├── image/           # Signature bg removal, scan enhancement & deskew
│   ├── ocr/             # Tesseract.js local OCR & searchable PDF builder
│   ├── ai/              # Curated open-source model catalog, Web Worker client, RAG chunking, resume audit
│   ├── security/        # AES-256 encryption, authorized unlock, metadata, PII scan, permanent redaction
│   ├── performance/     # Device capability detection, adaptive profiles, TaskQueue, LRUCache
│   ├── storage/         # IndexedDB schema & repositories
│   └── utils/           # Formatting, Blob download, worker ZIP
├── stores/              # Zustand stores (preferences, workspace, queue)
├── workers/             # Dedicated Web Workers (ai.worker.ts, zip.worker.ts)
├── routes/              # 15 feature routes
└── styles/              # Tailwind v4 design tokens & themes
```

---

## Local AI Models & Licenses

All AI models are **100% optional** and **never downloaded automatically** or on startup. Users explicitly choose when to download them in **AI Workspace → Model Manager**:

| Model | Task | Approx. Size | License |
| --- | --- | --- | --- |
| `onnx-community/SmolLM2-360M-Instruct` | Light Chat / Summary | ~230 MB | Apache-2.0 |
| `onnx-community/Qwen2.5-0.5B-Instruct` | Balanced Chat / Q&A | ~480 MB | Apache-2.0 |
| `onnx-community/Qwen2.5-1.5B-Instruct` | Advanced Chat (WebGPU) | ~1.1 GB | Apache-2.0 |
| `Xenova/m2m100_418M` | Translation (100 langs, EN ↔ BN) | ~470 MB | MIT |
| `Xenova/all-MiniLM-L6-v2` | Local Embeddings | ~23 MB | Apache-2.0 |

Tesseract.js OCR language packs (`.traineddata.gz`) are licensed under Apache-2.0 and downloaded on demand when OCR is run.

---

## Privacy Architecture

- **All PDF operations run locally** in your browser's memory and Web Workers.
- **No backend server** receives your PDFs, signatures, or document text.
- **Local storage**: Recent files, projects, and signature presets are stored in IndexedDB (`paperflow`) and can be cleared individually or completely from `/privacy`.
- **Network requests**: Only occur when you explicitly click Download on an AI model (Hugging Face Hub) or run OCR with an uncached language pack.

---

## Performance Modes

PaperFlow AI detects CPU cores, `navigator.deviceMemory`, WebGPU, and `prefers-reduced-motion` to select an automatic profile:

- **Low Memory**: 1× max DPR, sequential rendering (concurrency 1), 48-entry thumbnail LRU cache, zero prefetching, reduced animations.
- **Balanced**: 1.5× max DPR, concurrency 2, 120-entry thumbnail cache, 1-page prefetch.
- **High Performance**: 2× max DPR, multi-worker concurrency, 240-entry thumbnail cache, WebGPU when supported.

You can override the mode anytime in `/settings`.

---

## Browser Compatibility & Limitations

- **Recommended browsers**: Latest Chrome, Edge, Firefox, or Safari (ES2022 + WebAssembly + IndexedDB). WebGPU acceleration is supported on modern Chromium-based browsers and Safari.
- **Visual signatures**: Signature Studio creates visual electronic signatures (transparent handwritten/image overlays), not cryptographic X.509 digital certificates.
- **Permanent redaction**: Rasterizes affected pages to permanently destroy underlying text/images in redacted regions; un-redacted pages remain vector PDFs.
- **DOCX / HTML to PDF**: Preserves clean readable text flow locally without cloud servers; complex Word formatting (floating shapes, equations, custom fonts) is simplified.
- **Standard PDF fonts**: Text annotations and text-to-PDF use built-in PDF standard fonts (WinAnsi encoding); non-Latin scripts in scanned documents are best preserved via image/canvas rendering or OCR text export.

---

## Troubleshooting

- **Storage quota exceeded**: Open **Privacy (`/privacy`)** to clear cached previews, temporary files, or unused AI models.
- **Slow AI inference**: Switch to **Light AI** (`SmolLM2 360M`) or enable WebGPU in **Settings → AI Acceleration**.
- **OCR language download failed**: Check internet connectivity for the first download of a language pack; subsequent runs work offline from browser cache.
