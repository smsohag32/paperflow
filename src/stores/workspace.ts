import { create } from 'zustand'
import { uid } from '@/lib/utils/id'
import type { Rotation, Rect } from '@/types/common'
import {
  DEFAULT_HEADER_FOOTER,
  DEFAULT_PAGE_NUMBERS,
  DEFAULT_WATERMARK,
  type Annotation,
  type AnnotationInput,
  type EditorTool,
  type HeaderFooterConfig,
  type PageNumberConfig,
  type WatermarkConfig,
  type WorkspaceDoc,
  type WorkspacePage,
} from '@/types/workspace'
import { addLibraryFile, getLibraryBlob } from '@/lib/storage/repo'
import { getDB, kvDelete, kvGet, kvSet, safeWrite } from '@/lib/storage/db'
import { getDocument, registerSource, releaseDocument } from '@/lib/pdf/render'
import { convertedTextLayers } from '@/lib/pdf/convert'

const AUTOSAVE_KEY = 'autosave:workspace'
const MAX_HISTORY = 40

interface WorkspaceState {
  doc: WorkspaceDoc | null
  originalDoc: WorkspaceDoc | null
  past: WorkspaceDoc[]
  future: WorkspaceDoc[]
  activePageId: string | null
  selectedPageIds: string[]
  selectedAnnotationId: string | null
  tool: EditorTool
  zoom: number
  fitMode: 'custom' | 'width' | 'page'
  dirty: boolean
  loading: boolean
  /** Default style for new annotations */
  toolStyle: {
    color: string
    bgColor: string
    strokeWidth: number
    fontSize: number
    fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier'
    opacity: number
  }

  openFile: (file: File, opts?: { password?: string; existingSourceId?: string }) => Promise<void>
  appendFile: (file: File, opts?: { password?: string }) => Promise<void>
  loadSavedProject: (projectId: string) => Promise<void>
  restoreAutosave: () => Promise<boolean>
  hasAutosave: () => Promise<boolean>
  saveProject: (name?: string) => Promise<string | null>
  closeDoc: () => void
  renameDoc: (name: string) => void

  setActivePage: (pageId: string) => void
  toggleSelectPage: (pageId: string, multi?: boolean) => void
  selectAllPages: () => void
  clearPageSelection: () => void
  setTool: (tool: EditorTool) => void
  setToolStyle: (patch: Partial<WorkspaceState['toolStyle']>) => void
  setZoom: (zoom: number, fitMode?: WorkspaceState['fitMode']) => void
  selectAnnotation: (id: string | null) => void

  reorderPages: (oldIndex: number, newIndex: number) => void
  rotatePages: (pageIds: string[], delta: 90 | -90 | 180) => void
  deletePages: (pageIds: string[]) => void
  duplicatePage: (pageId: string) => void
  insertBlankPage: (afterPageId?: string, size?: { width: number; height: number }) => void
  setCrop: (pageIds: string[], crop?: Rect) => void
  resizePages: (pageIds: string[], width: number, height: number) => void

  addAnnotation: (pageId: string, ann: AnnotationInput) => string
  updateAnnotation: (pageId: string, annId: string, patch: Partial<Annotation>, recordHistory?: boolean) => void
  deleteAnnotation: (pageId: string, annId: string) => void
  bringForward: (pageId: string, annId: string) => void
  sendBackward: (pageId: string, annId: string) => void

  setPageNumbers: (patch: Partial<PageNumberConfig>) => void
  setWatermark: (patch: Partial<WatermarkConfig>) => void
  setHeaderFooter: (patch: Partial<HeaderFooterConfig>) => void

  undo: () => void
  redo: () => void
  restoreOriginal: () => void
}

function cloneDoc(d: WorkspaceDoc): WorkspaceDoc {
  // Structured clone excluding transient passwords if needed
  return structuredClone(d)
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave(doc: WorkspaceDoc | null) {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  if (!doc) return
  autosaveTimer = setTimeout(() => {
    const clean = { ...doc, passwords: undefined }
    kvSet(AUTOSAVE_KEY, clean).catch(() => {})
  }, 800)
}

async function buildPagesFromFile(
  file: File,
  opts: { password?: string; existingSourceId?: string } = {},
): Promise<{ sourceId: string; pages: WorkspacePage[] }> {
  let sourceId = opts.existingSourceId
  if (!sourceId) {
    const meta = await addLibraryFile(file, file.name)
    sourceId = meta.id
  }
  const sid = sourceId
  const customSpans = convertedTextLayers.get(file)
  if (customSpans) {
    await kvSet(`textlayer:${sid}`, customSpans).catch(() => {})
  }
  registerSource(sid, async () => {
    const blob = await getLibraryBlob(sid)
    if (!blob) throw new Error('Document file is no longer in local storage.')
    return { data: blob, password: opts.password }
  })
  const pdf = await getDocument(sid)
  const pages: WorkspacePage[] = []
  for (let i = 0; i < pdf.numPages; i++) {
    const p = await pdf.getPage(i + 1)
    const vp = p.getViewport({ scale: 1 })
    pages.push({
      id: uid('pg'),
      sourceId: sid,
      sourcePageIndex: i,
      width: vp.width,
      height: vp.height,
      rotation: 0,
      annotations: [],
    })
  }
  // Update page count in library
  const db = await getDB()
  const existing = await db.get('files', sid)
  if (existing) {
    await db.put('files', { ...existing, pageCount: pdf.numPages, lastOpenedAt: Date.now() })
  }
  return { sourceId: sid, pages }
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const commit = (updater: (doc: WorkspaceDoc) => WorkspaceDoc) => {
    const cur = get().doc
    if (!cur) return
    const next = { ...updater(cloneDoc(cur)), updatedAt: Date.now() }
    set((s) => ({
      doc: next,
      past: [...s.past.slice(-(MAX_HISTORY - 1)), cur],
      future: [],
      dirty: true,
    }))
    scheduleAutosave(next)
  }

  return {
    doc: null,
    originalDoc: null,
    past: [],
    future: [],
    activePageId: null,
    selectedPageIds: [],
    selectedAnnotationId: null,
    tool: 'select',
    zoom: 1,
    fitMode: 'width',
    dirty: false,
    loading: false,
    toolStyle: {
      color: '#1e293b',
      bgColor: 'transparent',
      strokeWidth: 2,
      fontSize: 14,
      fontFamily: 'Helvetica',
      opacity: 1,
    },

    openFile: async (file, opts) => {
      set({ loading: true })
      try {
        const { sourceId, pages } = await buildPagesFromFile(file, opts)
        const doc: WorkspaceDoc = {
          id: uid('doc'),
          name: file.name,
          pages,
          passwords: opts?.password ? { [sourceId]: opts.password } : undefined,
          pageNumbers: { ...DEFAULT_PAGE_NUMBERS },
          watermark: { ...DEFAULT_WATERMARK },
          headerFooter: { ...DEFAULT_HEADER_FOOTER },
          updatedAt: Date.now(),
        }
        set({
          doc,
          originalDoc: cloneDoc(doc),
          past: [],
          future: [],
          activePageId: pages[0]?.id ?? null,
          selectedPageIds: [],
          selectedAnnotationId: null,
          dirty: false,
          loading: false,
        })
        scheduleAutosave(doc)
      } catch (e) {
        set({ loading: false })
        throw e
      }
    },

    appendFile: async (file, opts) => {
      const cur = get().doc
      if (!cur) return get().openFile(file, opts)
      const { sourceId, pages } = await buildPagesFromFile(file, opts)
      commit((d) => ({
        ...d,
        pages: [...d.pages, ...pages],
        passwords: opts?.password ? { ...d.passwords, [sourceId]: opts.password } : d.passwords,
      }))
    },

    loadSavedProject: async (projectId) => {
      const db = await getDB()
      const project = await db.get('projects', projectId)
      if (!project) throw new Error('Saved project not found.')
      const doc = project.doc as WorkspaceDoc
      const sids = new Set(doc.pages.map((p) => p.sourceId).filter(Boolean) as string[])
      for (const sid of sids) {
        registerSource(sid, async () => {
          const blob = await getLibraryBlob(sid)
          if (!blob) throw new Error('Source PDF for this project was cleared from local storage.')
          return { data: blob }
        })
      }
      set({
        doc,
        originalDoc: cloneDoc(doc),
        past: [],
        future: [],
        activePageId: doc.pages[0]?.id ?? null,
        selectedPageIds: [],
        selectedAnnotationId: null,
        dirty: false,
      })
    },

    hasAutosave: async () => {
      const saved = await kvGet<WorkspaceDoc>(AUTOSAVE_KEY)
      return !!(saved && saved.pages?.length)
    },

    restoreAutosave: async () => {
      const saved = await kvGet<WorkspaceDoc>(AUTOSAVE_KEY)
      if (!saved || !saved.pages?.length) return false
      const sids = new Set(saved.pages.map((p) => p.sourceId).filter(Boolean) as string[])
      for (const sid of sids) {
        const blob = await getLibraryBlob(sid)
        if (!blob) return false
        registerSource(sid, async () => ({ data: (await getLibraryBlob(sid))! }))
      }
      set({
        doc: saved,
        originalDoc: cloneDoc(saved),
        past: [],
        future: [],
        activePageId: saved.pages[0]?.id ?? null,
        selectedPageIds: [],
        selectedAnnotationId: null,
        dirty: false,
      })
      return true
    },

    saveProject: async (name) => {
      const doc = get().doc
      if (!doc) return null
      const db = await getDB()
      const now = Date.now()
      const projectName = name?.trim() || doc.name
      const clean = { ...doc, name: projectName, passwords: undefined, updatedAt: now }
      await safeWrite(() =>
        db.put('projects', {
          id: doc.id,
          name: projectName,
          createdAt: now,
          updatedAt: now,
          doc: clean,
          pageCount: doc.pages.length,
        }),
      )
      set({ dirty: false, doc: { ...doc, name: projectName } })
      return doc.id
    },

    closeDoc: () => {
      const cur = get().doc
      if (cur) {
        const sids = new Set(cur.pages.map((p) => p.sourceId).filter(Boolean) as string[])
        sids.forEach((sid) => releaseDocument(sid).catch(() => {}))
      }
      kvDelete(AUTOSAVE_KEY).catch(() => {})
      set({
        doc: null,
        originalDoc: null,
        past: [],
        future: [],
        activePageId: null,
        selectedPageIds: [],
        selectedAnnotationId: null,
        dirty: false,
      })
    },

    renameDoc: (name) => {
      commit((d) => ({ ...d, name }))
    },

    setActivePage: (pageId) => set({ activePageId: pageId, selectedAnnotationId: null }),
    toggleSelectPage: (pageId, multi = true) =>
      set((s) => {
        if (!multi) return { selectedPageIds: [pageId], activePageId: pageId }
        const exists = s.selectedPageIds.includes(pageId)
        return {
          selectedPageIds: exists
            ? s.selectedPageIds.filter((id) => id !== pageId)
            : [...s.selectedPageIds, pageId],
        }
      }),
    selectAllPages: () => set((s) => ({ selectedPageIds: s.doc?.pages.map((p) => p.id) ?? [] })),
    clearPageSelection: () => set({ selectedPageIds: [] }),
    setTool: (tool) => set({ tool }),
    setToolStyle: (patch) => set((s) => ({ toolStyle: { ...s.toolStyle, ...patch } })),
    setZoom: (zoom, fitMode = 'custom') =>
      set({ zoom: Math.min(4, Math.max(0.25, zoom)), fitMode }),
    selectAnnotation: (id) => set({ selectedAnnotationId: id }),

    reorderPages: (oldIndex, newIndex) => {
      if (oldIndex === newIndex) return
      commit((d) => {
        const pages = [...d.pages]
        const [moved] = pages.splice(oldIndex, 1)
        pages.splice(newIndex, 0, moved)
        return { ...d, pages }
      })
    },

    rotatePages: (pageIds, delta) => {
      const ids = new Set(pageIds)
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          ids.has(p.id)
            ? { ...p, rotation: ((((p.rotation + delta) % 360) + 360) % 360) as Rotation }
            : p,
        ),
      }))
    },

    deletePages: (pageIds) => {
      const cur = get().doc
      if (!cur) return
      const ids = new Set(pageIds)
      if (cur.pages.length - ids.size < 1) return
      commit((d) => ({ ...d, pages: d.pages.filter((p) => !ids.has(p.id)) }))
      set((s) => {
        const nextPages = s.doc?.pages ?? []
        const activeStill = nextPages.some((p) => p.id === s.activePageId)
        return {
          selectedPageIds: s.selectedPageIds.filter((id) => !ids.has(id)),
          activePageId: activeStill ? s.activePageId : (nextPages[0]?.id ?? null),
        }
      })
    },

    duplicatePage: (pageId) => {
      commit((d) => {
        const idx = d.pages.findIndex((p) => p.id === pageId)
        if (idx < 0) return d
        const copy: WorkspacePage = {
          ...structuredClone(d.pages[idx]),
          id: uid('pg'),
          annotations: d.pages[idx].annotations.map((a) => ({ ...structuredClone(a), id: uid('ann') })),
        }
        const pages = [...d.pages]
        pages.splice(idx + 1, 0, copy)
        return { ...d, pages }
      })
    },

    insertBlankPage: (afterPageId, size) => {
      const newId = uid('pg')
      commit((d) => {
        const idx = afterPageId ? d.pages.findIndex((p) => p.id === afterPageId) : d.pages.length - 1
        const ref = d.pages[idx >= 0 ? idx : 0]
        const blank: WorkspacePage = {
          id: newId,
          sourceId: null,
          sourcePageIndex: -1,
          width: size?.width ?? ref?.width ?? 595.28,
          height: size?.height ?? ref?.height ?? 841.89,
          rotation: 0,
          bgColor: '#ffffff',
          annotations: [],
        }
        const pages = [...d.pages]
        pages.splice(idx + 1, 0, blank)
        return { ...d, pages }
      })
      set({ activePageId: newId })
    },

    setCrop: (pageIds, crop) => {
      const ids = new Set(pageIds)
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) => (ids.has(p.id) ? { ...p, crop } : p)),
      }))
    },

    resizePages: (pageIds, width, height) => {
      const ids = new Set(pageIds)
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) => (ids.has(p.id) ? { ...p, width, height } : p)),
      }))
    },

    addAnnotation: (pageId, ann) => {
      const id = uid('ann')
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? { ...p, annotations: [...p.annotations, { ...ann, id } as Annotation] }
            : p,
        ),
      }))
      set({ selectedAnnotationId: id })
      return id
    },

    updateAnnotation: (pageId, annId, patch, recordHistory = true) => {
      const apply = (d: WorkspaceDoc): WorkspaceDoc => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                annotations: p.annotations.map((a) =>
                  a.id === annId ? ({ ...a, ...patch } as Annotation) : a,
                ),
              }
            : p,
        ),
      })
      if (recordHistory) {
        commit(apply)
      } else {
        const cur = get().doc
        if (!cur) return
        const next = apply(cur)
        set({ doc: next, dirty: true })
        scheduleAutosave(next)
      }
    },

    deleteAnnotation: (pageId, annId) => {
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId ? { ...p, annotations: p.annotations.filter((a) => a.id !== annId) } : p,
        ),
      }))
      if (get().selectedAnnotationId === annId) set({ selectedAnnotationId: null })
    },

    bringForward: (pageId, annId) => {
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) => {
          if (p.id !== pageId) return p
          const i = p.annotations.findIndex((a) => a.id === annId)
          if (i < 0 || i === p.annotations.length - 1) return p
          const arr = [...p.annotations]
          ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
          return { ...p, annotations: arr }
        }),
      }))
    },

    sendBackward: (pageId, annId) => {
      commit((d) => ({
        ...d,
        pages: d.pages.map((p) => {
          if (p.id !== pageId) return p
          const i = p.annotations.findIndex((a) => a.id === annId)
          if (i <= 0) return p
          const arr = [...p.annotations]
          ;[arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]
          return { ...p, annotations: arr }
        }),
      }))
    },

    setPageNumbers: (patch) => commit((d) => ({ ...d, pageNumbers: { ...d.pageNumbers, ...patch } })),
    setWatermark: (patch) => commit((d) => ({ ...d, watermark: { ...d.watermark, ...patch } })),
    setHeaderFooter: (patch) => commit((d) => ({ ...d, headerFooter: { ...d.headerFooter, ...patch } })),

    undo: () =>
      set((s) => {
        if (!s.doc || s.past.length === 0) return s
        const prev = s.past[s.past.length - 1]
        scheduleAutosave(prev)
        return {
          doc: prev,
          past: s.past.slice(0, -1),
          future: [s.doc, ...s.future].slice(0, MAX_HISTORY),
          dirty: true,
        }
      }),

    redo: () =>
      set((s) => {
        if (!s.doc || s.future.length === 0) return s
        const next = s.future[0]
        scheduleAutosave(next)
        return {
          doc: next,
          past: [...s.past, s.doc].slice(-MAX_HISTORY),
          future: s.future.slice(1),
          dirty: true,
        }
      }),

    restoreOriginal: () => {
      const orig = get().originalDoc
      if (!orig) return
      const restored = cloneDoc(orig)
      set({
        doc: restored,
        past: [],
        future: [],
        activePageId: restored.pages[0]?.id ?? null,
        selectedPageIds: [],
        selectedAnnotationId: null,
        dirty: false,
      })
      scheduleAutosave(restored)
    },
  }
})
