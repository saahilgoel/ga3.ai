// Tiny FIFO-bounded TTL cache for in-process API result caching.
// Prevents the Next dev server from getting memory-killed when range / report
// combinations multiply over a long session.

export class BoundedCache<V> {
  private store = new Map<string, { at: number; data: V }>();
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 32
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    // Touch — move to end for FIFO-ish recency
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.data;
  }

  set(key: string, data: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { at: Date.now(), data });
    if (this.store.size > this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
