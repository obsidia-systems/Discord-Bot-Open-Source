/**
 * Abstracción de caché con TTL por clave.
 *
 * Hoy solo `MemoryStore` (L1 por proceso). En multi-réplica el rol `api` tiene
 * cachés incoherentes tras un cambio (p. ej. upgrade de tier): la implementación
 * `RedisStore` (L1 local + L2 Redis + invalidación por pub/sub) llega en P2.16
 * y es un drop-in — el resto del código solo habla con `cache()`.
 */

import { BoundedTtlMap } from "./boundedTtlMap.js";

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** L1 por proceso. Sin dependencias externas (rol `all` / dev). */
export class MemoryStore implements CacheStore {
  private readonly map: BoundedTtlMap<string, unknown>;

  constructor(maxSize = 20_000) {
    this.map = new BoundedTtlMap<string, unknown>(maxSize, 60_000);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

let store: CacheStore = new MemoryStore();

/** Sustituye el store global (p. ej. `RedisStore` en producción multi-réplica). */
export function setCacheStore(next: CacheStore): void {
  store = next;
}

export function cache(): CacheStore {
  return store;
}
