/**
 * Map con TTL y tamaño máximo (LRU). Sustituye `Map` ilimitados por-proceso.
 */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class BoundedTtlMap<K, V> {
  private readonly data = new Map<K, Entry<V>>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get size(): number {
    return this.data.size;
  }

  get(key: K): V | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    this.data.delete(key);
    this.data.set(key, entry);
    return entry.value;
  }

  /** `ttlMs` opcional sobreescribe el TTL por defecto para esta entrada. */
  set(key: K, value: V, ttlMs?: number): this {
    this.data.delete(key);
    this.data.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
    while (this.data.size > this.maxSize) {
      const oldest = this.data.keys().next().value;
      if (oldest === undefined) break;
      this.data.delete(oldest);
    }
    return this;
  }

  delete(key: K): boolean {
    return this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}
