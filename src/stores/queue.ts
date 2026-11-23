import { create } from 'zustand'
import { uid } from '@/lib/utils/id'
import type { OutputFile } from '@/types/common'

export type JobStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled'

export interface QueueJob {
  id: string
  tool: string
  title: string
  fileName: string
  status: JobStatus
  progress: number
  detail?: string
  error?: string
  output?: OutputFile
  createdAt: number
  completedAt?: number
  /** Internal runner function stored outside serialized state */
  _run?: (ctx: { signal: AbortSignal; setProgress: (p: number, detail?: string) => void }) => Promise<OutputFile>
  _controller?: AbortController
}

interface QueueState {
  jobs: QueueJob[]
  paused: boolean
  enqueue: (
    meta: { tool: string; title: string; fileName: string },
    run: NonNullable<QueueJob['_run']>,
  ) => string
  cancel: (id: string) => void
  retry: (id: string) => void
  remove: (id: string) => void
  clearFinished: () => void
  togglePause: () => void
  setConcurrency: (n: number) => void
}

let maxConcurrency = 2

export const useQueueStore = create<QueueState>((set, get) => {
  const pump = () => {
    const state = get()
    if (state.paused) return
    const running = state.jobs.filter((j) => j.status === 'running').length
    const available = Math.max(0, maxConcurrency - running)
    if (available === 0) return

    const next = state.jobs.filter((j) => j.status === 'queued').slice(0, available)
    for (const job of next) {
      if (!job._run) continue
      const controller = new AbortController()
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === job.id
            ? { ...j, status: 'running', progress: 0, error: undefined, _controller: controller }
            : j,
        ),
      }))
      job
        ._run({
          signal: controller.signal,
          setProgress: (p, detail) => {
            set((s) => ({
              jobs: s.jobs.map((j) =>
                j.id === job.id ? { ...j, progress: Math.min(1, Math.max(0, p)), detail } : j,
              ),
            }))
          },
        })
        .then(
          (output) => {
            set((s) => ({
              jobs: s.jobs.map((j) =>
                j.id === job.id
                  ? { ...j, status: 'done', progress: 1, output, completedAt: Date.now(), _controller: undefined }
                  : j,
              ),
            }))
          },
          (err) => {
            const aborted =
              controller.signal.aborted ||
              (err instanceof Error && (err.name === 'AbortError' || err.message === 'Cancelled'))
            set((s) => ({
              jobs: s.jobs.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: aborted ? 'cancelled' : 'error',
                      error: aborted ? undefined : err instanceof Error ? err.message : 'Processing failed',
                      _controller: undefined,
                    }
                  : j,
              ),
            }))
          },
        )
        .finally(() => pump())
    }
  }

  return {
    jobs: [],
    paused: false,
    enqueue: (meta, run) => {
      const id = uid('job')
      const job: QueueJob = {
        id,
        tool: meta.tool,
        title: meta.title,
        fileName: meta.fileName,
        status: 'queued',
        progress: 0,
        createdAt: Date.now(),
        _run: run,
      }
      set((s) => ({ jobs: [job, ...s.jobs] }))
      queueMicrotask(pump)
      return id
    },
    cancel: (id) => {
      const job = get().jobs.find((j) => j.id === id)
      job?._controller?.abort()
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id && (j.status === 'queued' || j.status === 'running')
            ? { ...j, status: 'cancelled', _controller: undefined }
            : j,
        ),
      }))
      queueMicrotask(pump)
    },
    retry: (id) => {
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id && (j.status === 'error' || j.status === 'cancelled')
            ? { ...j, status: 'queued', progress: 0, error: undefined }
            : j,
        ),
      }))
      queueMicrotask(pump)
    },
    remove: (id) => {
      const job = get().jobs.find((j) => j.id === id)
      job?._controller?.abort()
      set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }))
    },
    clearFinished: () =>
      set((s) => ({ jobs: s.jobs.filter((j) => j.status === 'queued' || j.status === 'running') })),
    togglePause: () => {
      set((s) => ({ paused: !s.paused }))
      queueMicrotask(pump)
    },
    setConcurrency: (n) => {
      maxConcurrency = Math.max(1, n)
      queueMicrotask(pump)
    },
  }
})
