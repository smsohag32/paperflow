<div align="center">

# PaperFlow AI

**A free, open-source, privacy-first PDF & Document Productivity Suite that runs 100% locally in your browser.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-paperflow.sohagsheik.com-5e6ad2?style=for-the-badge)](https://paperflow.sohagsheik.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](./LICENSE)
[![100% Client-Side](https://img.shields.io/badge/Privacy-100%25_Client--Side-0ea5e9?style=for-the-badge)](#privacy-architecture)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*Zero subscriptions · Zero API keys · Zero cloud uploads · Zero watermarks · Engineered for speed even on 4 GB RAM devices.*

</div>

---

## Why PaperFlow AI?

Most online PDF tools force you to upload sensitive contracts, invoices, bank statements, and resumes to third-party servers — or lock basic features behind paywalls. **PaperFlow AI** brings a full desktop-class document suite directly into your browser:

- **100% Local Processing**: Every PDF edit, compression, OCR scan, image extraction, template export, and AI query runs locally in browser memory & Web Workers.
- **All-in-One Open-Source Suite**: 18+ specialized tools — from a full PDF Editor & Document Templates Builder to a Multi-File Markdown Studio with KaTeX math formulas.
- **Smooth, Premium UX**: Adaptive Dark/Light themes, smooth tactile size sliders with floating tooltips & double-click reset, full-viewport Fullscreen modes, and instant keyboard shortcuts (`Ctrl+K`, `Ctrl+F`, `Ctrl+Z`).
- **Lightweight & Offline-Ready**: Route-level code splitting, bounded-memory LRU caches, and hardware-aware performance profiles.

---

## Complete Tool Suite

| Tool | Route | What It Does |
| --- | --- | --- |
| **PDF Workspace** | `/workspace` | Full PDF editor, Dark Mode / Invert reader, annotations, stamps, search, page organizer, watermarks, headers/footers & recent project cards |
| **Document Templates** | `/templates` | Build crisp vector **Invoices** (auto tax/discount/total, multi-currency), **Resumes/CVs**, **Certificates**, and **Letterheads** with live preview & saved drafts |
| **Markdown Studio** | `/markdown` | Multi-file VS Code-style `.md` editor & live preview with **KaTeX LaTeX math** (`$$...$$`, `\begin{cases}`, Bengali/Unicode math), tabs, files sidebar & fullscreen |
| **Compression Studio** | `/compress` | Adaptive compression with logarithmic **Target File Size Slider**, live size estimate, Page 1 before/after quality preview, and batch ZIP compression |
| **PDF Compare Studio** | `/compare` | Compare two PDFs **Side-by-Side**, with an **Overlay Wipe Slider**, **Pixel-Level Visual Diff**, and per-page **Text Changes** inspector |
| **Extract Images & Media** | `/media` | Extract all embedded photos & charts in original quality, 1-click ZIP export, format conversion, lightbox viewer, and in-place remove/replace images in PDF |
| **Merge PDF** | `/merge` | Combine multiple PDFs in any page order with drag-and-drop sorting |
| **Split & Extract** | `/split` | Split by custom ranges (`1-3, 4-6`), every N pages, individual pages (ZIP), or extract `odd` / `even` / `last` pages |
| **Signature Studio** | `/sign` | Draw handwritten signatures or upload photos with automatic pixel background removal, feathering, before/after slider, and reusable IndexedDB presets |
| **Convert Studio** | `/convert` | Images (JPG/PNG/WebP) ↔ PDF, Markdown/DOCX/HTML/Text → PDF, and PDF → Plain Text |
| **OCR & Searchable PDF** | `/ocr` | Local Tesseract.js OCR (English, Bangla `ben`, Hindi, Arabic, and 6+ more languages) with TXT/JSON export and invisible-text searchable PDFs |
| **Scan Enhancement** | `/enhance` | Auto-deskew, shadow/background cleanup, contrast, sharpen, denoise, 8 document presets, and live before/after split preview |
| **Local AI Workspace** | `/ai` | Optional local LLMs via WebGPU/WASM (`SmolLM2`, `Qwen2.5`, `M2M100` translation) for Q&A, summaries, flashcards, EN ↔ BN translation & resume audit |
| **Extract & Intelligence** | `/extract` | Text & spatial table extraction (CSV/JSON), document classification, and page audit (blank pages, duplicates, scans needing OCR) |
| **Security & Redaction** | `/protect` | AES-256 encryption, authorized unlock, metadata editor/stripper, PII detection, and permanent rasterized redaction |
| **Batch & Queue** | `/tools?tab=batch` | Bounded-concurrency batch processing queue with pause/resume/cancel/retry and ZIP export |
| **Privacy & Settings** | `/privacy` · `/settings` | Hardware diagnostics, adaptive performance profiles, and granular local storage clearing |

---

## Feature Highlights

### PDF Workspace (`/workspace`)
- **Dark Mode / Invert Colors PDF**: 1-click Night Read toggle in the toolbar + 5 modes in the `Doc` panel (**Original**, **Night Read**, **Invert Print Slides**, **Warm Sepia**, **Ink-Saver B&W**). Syncs smoothly with left-sidebar thumbnails and lets you **export a print-friendly white-background PDF** from dark slides in 1 click.
- **Smooth Navigation & Fullscreen**: Gliding active-page focus box in the thumbnail sidebar, smooth zoom slider + `Ctrl + Wheel` zoom, full-viewport **Fullscreen mode** (`Esc` to exit), and in-document **Full-Text Search** (`Ctrl+F`).
- **Complete Editing**: Drag-and-drop page reordering, batch **Odd / Even / Reverse** organizer, standard page size resizer (`A4`, `Letter`, `Legal`, `A5`), 1-click **Quick Stamps** (`APPROVED`, `CONFIDENTIAL`, `DRAFT`, `REVIEWED`, `PAID`, `FINAL`), text, highlights, freehand drawing, shapes, sticky notes, images, signatures, crop, watermarks, page numbers, and permanent redactions.
- **Recent & Saved Project Cards**: Reopen saved projects and recent PDFs directly from `/workspace`.

### Document Templates Studio (`/templates`)
- **Hub + Recent Projects**: Click any of the 4 template boxes (**Invoice**, **Resume / CV**, **Certificate**, **Letterhead**) to create a new document, or reopen any auto-saved draft / saved project from the Recent Projects card grid.
- **Live WYSIWYG Paper Preview**: Real-time A4 Portrait / A4 Landscape paper preview with smooth zoom slider, 3 layout styles per template, custom brand accent colors, font & text scale controls, logo upload, and 1-click integration with saved signatures from Signature Studio.
- **Vector PDF & Workspace Export**: Export crisp vector PDFs directly, back up/import template JSON, or click **Open in Workspace** for further editing.

### Markdown Studio (`/markdown`)
- **Multi-File Tabs & Recent Files Sidebar**: Open or drag-and-drop multiple `.md` / `.markdown` / `.txt` files at once, switch tabs, navigate via the collapsible left **Files** panel or Prev/Next arrows, and expand into full-viewport **Fullscreen mode**.
- **Publication-Grade KaTeX Math**: Full support for block (`$$...$$`, `\[...\]`) and inline (`$...$`, `\(...\)`) LaTeX formulas — including `\frac`, `\begin{cases}`, `\min\left(...\right)`, and crisp **Bengali / Unicode** text inside equations — with hover **Copy LaTeX**.
- **VS Code-Style Experience**: Resizable split editor & preview panes, line-number gutter, syntax-highlighted code blocks, GitHub Alerts, GFM tables, interactive checklists, live Outline sidebar, and export to `.md`, themed `.html`, or Print/PDF.

### Compression Studio (`/compress`) & PDF Media Extractor (`/media`)
- **Compression Studio**: Logarithmic **Target File Size Slider** adaptive to your PDF's size, live estimated output bar, on-demand **Page 1 Before/After Visual Quality Preview**, and **Batch PDF Compression** with ZIP export.
- **PDF Media Extractor**: Extracts untouched original JPEGs (`/DCTDecode`) and decodes PNG/Flate graphics at native resolution, with 1-click **ZIP download**, format conversion (`Original`, `PNG`, `JPG`, `WebP`), smooth **Card Size Slider**, fullscreen Lightbox, and **in-place Remove / Replace images** inside the PDF.

---

## Tech Stack

- **Core**: React 19, TypeScript (strict), Vite, Tailwind CSS v4, Radix UI, Lucide React, React Router v7, Zustand, Zod
- **PDF & Documents**: `pdfjs-dist`, `@cantoo/pdf-lib`, `@dnd-kit`, `fflate` (Web Worker ZIP), `mammoth` (DOCX), `katex` (LaTeX math), `idb` (IndexedDB)
- **Local OCR & AI**: `tesseract.js`, `@huggingface/transformers` (ONNX Runtime Web / WebGPU)
- **Testing & Quality**: Vitest, React Testing Library, Playwright, ESLint, Prettier

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/sohagsheik/paperflow.git
cd paperflow

# 2. Install dependencies
npm install

# 3. Start the local dev server
npm run dev
```

### Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite development server (`http://localhost:5173`) |
| `npm run build` | Type-check and build optimized production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run strict TypeScript check (`tsc -b --noEmit`) |
| `npm run test` | Run unit & UI test suite with Vitest |
| `npm run test:e2e` | Run Playwright end-to-end smoke tests |
| `npm run lint` | Lint codebase with ESLint |
| `npm run format` | Format codebase with Prettier |

---

## Architecture

```text
src/
├── app/
│   ├── config/          # Tool registry & categories
│   ├── layout/          # Collapsible AppShell, header, mobile nav
│   └── router/          # Lazy-loaded routes (code-split per tool)
├── components/
│   ├── ui/              # Radix UI primitives, SmoothSizeSlider, polished Select
│   ├── shared/          # ErrorBoundary, CommandPalette, Dialogs
│   ├── upload/          # Accessible FileDropzone
│   ├── pdf-viewer/      # On-demand IntersectionObserver PageThumbnail
│   ├── editor/          # Interactive PageCanvas with annotation overlays & filters
│   ├── templates/       # Live WYSIWYG A4 paper preview for Templates Studio
│   └── markdown/        # VS Code-style GFM + KaTeX Markdown renderer
├── lib/
│   ├── pdf/             # pdfjs loader, render queue + LRU cache, ops, export, compress, convert, extract, media, templates
│   ├── markdown/        # Zero-dependency GFM + LaTeX math parser, HTML/text exporters & stats
│   ├── image/           # Signature background removal, scan enhancement & deskew
│   ├── ocr/             # Tesseract.js local OCR & searchable PDF builder
│   ├── ai/              # Curated open-source model catalog, Web Worker client, RAG chunking, resume audit
│   ├── security/        # AES-256 encryption, authorized unlock, metadata, PII scan, permanent redaction
│   ├── performance/     # Device capability detection, adaptive profiles, TaskQueue, LRUCache
│   ├── storage/         # IndexedDB schema & repositories
│   └── utils/           # Formatting, Blob download, worker ZIP
├── stores/              # Zustand stores (preferences, workspace, queue)
├── workers/             # Dedicated Web Workers (ai.worker.ts, zip.worker.ts)
├── routes/              # 19 lazy-loaded feature routes
└── styles/              # Tailwind v4 design tokens, dark/light themes & KaTeX styles
```

---

## Local AI Models & Licenses

All AI models are **100% optional** and **never downloaded automatically** or on startup. Users explicitly choose when to download them in **AI Workspace → Model Manager**:

| Model | Task | Approx. Size | License |
| --- | --- | --- | --- |
| `HuggingFaceTB/SmolLM2-360M-Instruct` | Light Chat / Summary | ~230 MB | Apache-2.0 |
| `onnx-community/Qwen2.5-0.5B-Instruct` | Balanced Chat / Q&A | ~480 MB | Apache-2.0 |
| `onnx-community/Qwen2.5-1.5B-Instruct` | Advanced Chat (WebGPU) | ~1.1 GB | Apache-2.0 |
| `Xenova/m2m100_418M` | Translation (100 langs, EN ↔ BN) | ~470 MB | MIT |
| `Xenova/all-MiniLM-L6-v2` | Local Embeddings | ~23 MB | Apache-2.0 |

Tesseract.js OCR language packs (`.traineddata.gz`) are licensed under Apache-2.0 and downloaded on demand when OCR is run.

---

## Privacy Architecture

- **All PDF & document operations run locally** in your browser's memory and Web Workers.
- **No backend server** ever receives your PDFs, Markdown files, templates, signatures, or document text.
- **Local storage**: Recent files, workspace projects, template drafts, Markdown files, and signature presets stay in your browser (IndexedDB & localStorage) and can be cleared individually or completely from `/privacy`.
- **Network requests**: Only occur when you explicitly download an optional AI model (Hugging Face Hub) or run OCR with an uncached language pack.

---

## Performance Modes

PaperFlow AI detects CPU cores, `navigator.deviceMemory`, WebGPU, and `prefers-reduced-motion` to select an automatic profile (overridable anytime in `/settings`):

- **Low Memory**: 1× max DPR, sequential rendering (concurrency 1), 48-entry thumbnail LRU cache, zero prefetching, reduced animations.
- **Balanced**: 1.5× max DPR, concurrency 2, 120-entry thumbnail cache, 1-page prefetch.
- **High Performance**: 2× max DPR, multi-worker concurrency, 240-entry thumbnail cache, WebGPU when supported.

---

## Browser Compatibility & Notes

- **Recommended browsers**: Latest Chrome, Edge, Firefox, or Safari (ES2022 + WebAssembly + IndexedDB). WebGPU acceleration is supported on modern Chromium-based browsers and Safari.
- **Visual signatures**: Signature Studio creates visual electronic signatures (transparent handwritten/image overlays), not cryptographic X.509 digital certificates.
- **Permanent redaction**: Rasterizes affected pages to permanently destroy underlying text/images in redacted regions; un-redacted pages remain vector PDFs.
- **DOCX / HTML to PDF**: Preserves clean readable text flow locally without cloud servers; complex Word layouts (floating shapes, footnotes, custom fonts) are simplified.

---

## Contributing

Contributions, bug reports, and feature ideas are warmly welcome!

1. Fork the repository and create a feature branch (`git checkout -b feat/your-feature`).
2. Make your changes and run `npm run typecheck && npm run test && npm run build`.
3. Open a Pull Request describing what you added or improved.

---

## License

Released under the [MIT License](./LICENSE) © 2026 [Sohag Sheik](https://www.sohagsheik.com/).
