let counter = 0

/** Short, collision-resistant local id. */
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1_000_000
  const rnd =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('')
      : Math.random().toString(36).slice(2, 12)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`
}
