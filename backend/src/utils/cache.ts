type CacheEntry<T> = { value: T; expiresAt: number };

export class SimpleCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs = 3000): void {
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

// Глобальные кэши
export const eventResultsCache = new SimpleCache<number, any>(500);
export const leaderboardCache = new SimpleCache<number, any>(500);
