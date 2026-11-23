import { getDB, safeWrite } from './db'
import type { LibraryFile, ProcessingHistoryEntry } from '@/types/common'
import { uid } from '@/lib/utils/id'

/* ─────────────── Library (recent files) ─────────────── */

export async function addLibraryFile(file: Blob, name: string, extra: Partial<LibraryFile> = {}) {
  const db = await getDB()
  const id = extra.id ?? uid('f')
  const now = Date.now()
  const meta: LibraryFile = {
    id,
    name,
    size: file.size,
    type: file.type || guessMime(name),
    createdAt: now,
    lastOpenedAt: now,
    ...extra,
  }
  await safeWrite(async () => {
    const tx = db.transaction(['files', 'blobs'], 'readwrite')
    await Promise.all([tx.objectStore('files').put(meta), tx.objectStore('blobs').put(file, id), tx.done])
  })
  return meta
}

export async function updateLibraryFile(id: string, patch: Partial<LibraryFile>) {
  const db = await getDB()
  const cur = await db.get('files', id)
  if (!cur) return
  await safeWrite(() => db.put('files', { ...cur, ...patch }))
}

export async function listLibraryFiles(limit = 50): Promise<LibraryFile[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('files', 'byOpened')
  return all.reverse().slice(0, limit)
}

export async function getLibraryBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB()
  return db.get('blobs', id)
}

export async function getLibraryFile(id: string): Promise<{ meta: LibraryFile; file: File } | undefined> {
  const db = await getDB()
  const [meta, blob] = await Promise.all([db.get('files', id), db.get('blobs', id)])
  if (!meta || !blob) return undefined
  return { meta, file: new File([blob], meta.name, { type: meta.type, lastModified: meta.createdAt }) }
}

export async function deleteLibraryFile(id: string) {
  const db = await getDB()
  const tx = db.transaction(['files', 'blobs', 'previews'], 'readwrite')
  await Promise.all([
    tx.objectStore('files').delete(id),
    tx.objectStore('blobs').delete(id),
    tx.objectStore('previews').delete(id),
    tx.done,
  ])
}

export async function savePreview(id: string, blob: Blob) {
  const db = await getDB()
  await safeWrite(() => db.put('previews', blob, id))
}

export async function getPreview(id: string) {
  const db = await getDB()
  return db.get('previews', id)
}

/* ─────────────── Assets (images placed in documents) ─────────────── */

export async function putAsset(blob: Blob, id = uid('a')) {
  const db = await getDB()
  await safeWrite(() => db.put('assets', blob, id))
  return id
}

export async function getAsset(id: string) {
  const db = await getDB()
  return db.get('assets', id)
}

/* ─────────────── Processing history ─────────────── */

export async function addHistory(entry: Omit<ProcessingHistoryEntry, 'id' | 'at'>) {
  const db = await getDB()
  try {
    await db.add('history', { ...entry, at: Date.now() })
    // keep history bounded
    const count = await db.count('history')
    if (count > 200) {
      const keys = await db.getAllKeys('history', null, count - 200)
      const tx = db.transaction('history', 'readwrite')
      await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done])
    }
  } catch {
    /* history is best-effort */
  }
}

export async function listHistory(limit = 30) {
  const db = await getDB()
  const all = await db.getAll('history')
  return all.reverse().slice(0, limit)
}

/* ─────────────── Clearing ─────────────── */

export type ClearTarget = 'documents' | 'previews' | 'temporary' | 'projects' | 'signatures' | 'history' | 'all'

export async function clearLocalData(target: ClearTarget) {
  const db = await getDB()
  const stores: (keyof import('./db').PaperflowDB)[] = {
    documents: ['files', 'blobs', 'previews'] as const,
    previews: ['previews'] as const,
    temporary: ['outputs', 'assets'] as const,
    projects: ['projects'] as const,
    signatures: ['signatures'] as const,
    history: ['history'] as const,
    all: ['files', 'blobs', 'previews', 'projects', 'assets', 'signatures', 'outputs', 'history', 'kv'] as const,
  }[target] as never
  const tx = db.transaction(stores, 'readwrite')
  await Promise.all([...(stores as string[]).map((s) => tx.objectStore(s as never).clear()), tx.done])
}

export function guessMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  return (
    {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      txt: 'text/plain',
      html: 'text/html',
      htm: 'text/html',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }[ext ?? ''] ?? 'application/octet-stream'
  )
}
