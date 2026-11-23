import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LibraryFile, ProcessingHistoryEntry } from '@/types/common'

/**
 * Single IndexedDB database for all large/binary local data.
 * Nothing in here ever leaves the device.
 */
export interface PaperflowDB extends DBSchema {
  files: { key: string; value: LibraryFile; indexes: { byOpened: number } }
  blobs: { key: string; value: Blob }
  previews: { key: string; value: Blob }
  projects: { key: string; value: StoredProject; indexes: { byUpdated: number } }
  assets: { key: string; value: Blob }
  signatures: { key: string; value: StoredSignature }
  outputs: { key: string; value: StoredOutput }
  history: { key: number; value: ProcessingHistoryEntry }
  kv: { key: string; value: unknown }
}

export interface StoredProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Serialized workspace document (JSON-safe) */
  doc: unknown
  pageCount: number
}

export interface StoredSignature {
  id: string
  name: string
  kind: 'signature' | 'initials' | 'stamp'
  blob: Blob
  width: number
  height: number
  createdAt: number
}

export interface StoredOutput {
  id: string
  name: string
  blob: Blob
  createdAt: number
  jobId?: string
}

const DB_NAME = 'paperflow'
const DB_VERSION = 1
let dbPromise: Promise<IDBPDatabase<PaperflowDB>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PaperflowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const files = db.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('byOpened', 'lastOpenedAt')
        db.createObjectStore('blobs')
        db.createObjectStore('previews')
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('byUpdated', 'updatedAt')
        db.createObjectStore('assets')
        db.createObjectStore('signatures', { keyPath: 'id' })
        db.createObjectStore('outputs', { keyPath: 'id' })
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
        db.createObjectStore('kv')
      },
      blocked() {
        console.warn('[paperflow] database upgrade blocked by another tab')
      },
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

export class StorageQuotaError extends Error {
  constructor() {
    super('Your browser storage is full. Free up space in Settings → Privacy & data.')
    this.name = 'StorageQuotaError'
  }
}

/** Wraps IDB writes and converts quota errors into a friendly error. */
export async function safeWrite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      throw new StorageQuotaError()
    }
    throw err
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get('kv', key)) as T | undefined
}

export async function kvSet(key: string, value: unknown) {
  const db = await getDB()
  await safeWrite(() => db.put('kv', value, key))
}

export async function kvDelete(key: string) {
  const db = await getDB()
  await db.delete('kv', key)
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const e = await navigator.storage.estimate()
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
}

/** Ask the browser to not evict our data under storage pressure (best effort). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* ignore */
  }
}
