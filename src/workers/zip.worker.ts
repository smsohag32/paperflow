/// <reference lib="webworker" />
import { zip } from 'fflate'

interface Entry {
  name: string
  data: Uint8Array
  level: 0 | 6
}

self.onmessage = (e: MessageEvent<Entry[]>) => {
  const obj: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const entry of e.data) obj[entry.name] = [entry.data, { level: entry.level }]
  zip(obj, (err, data) => {
    if (err) {
      ;(self as unknown as Worker).postMessage({ ok: false, error: err.message })
      return
    }
    ;(self as unknown as Worker).postMessage({ ok: true, data }, [data.buffer])
  })
}
