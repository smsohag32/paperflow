/** Small LRU map with an optional disposer that runs on eviction. */
export class LRUCache<K, V> {
  private map = new Map<K, V>()
  max: number
  private dispose?: (v: V, k: K) => void

  constructor(max: number, dispose?: (v: V, k: K) => void) {
    this.max = Math.max(1, max)
    this.dispose = dispose
  }

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  has(key: K) {
    return this.map.has(key)
  }

  set(key: K, value: V) {
    const existing = this.map.get(key)
    if (existing !== undefined) {
      this.map.delete(key)
      if (existing !== value) this.dispose?.(existing, key)
    }
    this.map.set(key, value)
    this.trim()
  }

  delete(key: K) {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.dispose?.(v, key)
    }
  }

  resize(max: number) {
    this.max = Math.max(1, max)
    this.trim()
  }

  clear() {
    for (const [k, v] of this.map) this.dispose?.(v, k)
    this.map.clear()
  }

  get size() {
    return this.map.size
  }

  keys() {
    return this.map.keys()
  }

  private trim() {
    while (this.map.size > this.max) {
      const [k, v] = this.map.entries().next().value as [K, V]
      this.map.delete(k)
      this.dispose?.(v, k)
    }
  }
}
