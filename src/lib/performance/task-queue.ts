/**
 * Bounded-concurrency priority task queue with cancellation.
 * Used for page rendering, batch processing and anything that must not
 * overwhelm low-end devices.
 */
export class AbortError extends Error {
  constructor(message = 'Cancelled') {
    super(message)
    this.name = 'AbortError'
  }
}

export function isAbortError(err: unknown) {
  return (
    err instanceof AbortError ||
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'RenderingCancelledException'))
  )
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortError()
}

interface QueuedTask<T> {
  run: (signal: AbortSignal) => Promise<T>
  priority: number
  seq: number
  controller: AbortController
  resolve: (v: T) => void
  reject: (e: unknown) => void
  key?: string
}

export class TaskQueue {
  private queue: QueuedTask<unknown>[] = []
  private running = 0
  private seq = 0
  private keyed = new Map<string, QueuedTask<unknown>>()
  concurrency: number

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, concurrency)
  }

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n)
    this.pump()
  }

  /**
   * Enqueue a task. Lower priority number runs first.
   * If `key` is provided and a task with that key is still waiting, its priority is updated instead.
   */
  add<T>(
    run: (signal: AbortSignal) => Promise<T>,
    opts: { priority?: number; signal?: AbortSignal; key?: string } = {},
  ): Promise<T> {
    const controller = new AbortController()
    if (opts.signal) {
      if (opts.signal.aborted) return Promise.reject(new AbortError())
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        run,
        priority: opts.priority ?? 10,
        seq: this.seq++,
        controller,
        resolve,
        reject,
        key: opts.key,
      }
      controller.signal.addEventListener(
        'abort',
        () => {
          const i = this.queue.indexOf(task as QueuedTask<unknown>)
          if (i >= 0) {
            this.queue.splice(i, 1)
            if (task.key) this.keyed.delete(task.key)
            reject(new AbortError())
          }
        },
        { once: true },
      )
      this.queue.push(task as QueuedTask<unknown>)
      if (task.key) this.keyed.set(task.key, task as QueuedTask<unknown>)
      this.pump()
    })
  }

  reprioritize(key: string, priority: number) {
    const t = this.keyed.get(key)
    if (t) t.priority = priority
  }

  get size() {
    return this.queue.length
  }
  get active() {
    return this.running
  }

  clear() {
    for (const t of this.queue) t.controller.abort()
    this.queue = []
    this.keyed.clear()
  }

  private pump() {
    while (this.running < this.concurrency && this.queue.length) {
      // pick best priority (stable by seq)
      let best = 0
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i]
        const b = this.queue[best]
        if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i
      }
      const task = this.queue.splice(best, 1)[0]
      if (task.key) this.keyed.delete(task.key)
      this.running++
      Promise.resolve()
        .then(() => {
          throwIfAborted(task.controller.signal)
          return task.run(task.controller.signal)
        })
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running--
          this.pump()
        })
    }
  }
}

/** Run an async mapper over items with bounded concurrency. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      throwIfAborted(signal)
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/** Yield to the event loop so the UI stays responsive during long main-thread loops. */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (sched?.yield) return sched.yield()
  return new Promise((r) => setTimeout(r, 0))
}
