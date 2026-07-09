export interface TtlCacheHit<T> {
  value: T
  expiresAt: number
}

export class TtlCache<TValue = unknown> {
  #entries = new Map<string, TtlCacheHit<TValue>>()

  get<T extends TValue = TValue>(key: string, now = Date.now()) {
    const cached = this.#entries.get(key) as TtlCacheHit<T> | undefined

    if (!cached || cached.expiresAt <= now) {
      return undefined
    }

    return cached
  }

  set(key: string, value: TValue, ttlMs: number, now = Date.now()) {
    this.#entries.set(key, { value, expiresAt: now + ttlMs })
  }

  delete(key: string) {
    this.#entries.delete(key)
  }

  deletePrefix(prefix: string) {
    for (const key of this.#entries.keys()) {
      if (key.startsWith(prefix)) {
        this.#entries.delete(key)
      }
    }
  }

  clear() {
    this.#entries.clear()
  }

  get size() {
    return this.#entries.size
  }
}
