/**
 * `CacheStore` de dos niveles para producción multi-réplica:
 *   L1  BoundedTtlMap por proceso (rápido, TTL corto)
 *   L2  Redis (compartido entre todas las réplicas)
 *   pub/sub  al hacer `del`, publica la clave para que las demás réplicas
 *            tiren su L1 — así un cambio (p. ej. upgrade de tier) se propaga
 *            al instante en vez de esperar el TTL.
 *
 * Resiliente: cualquier fallo de Redis degrada a L1 / miss (nunca lanza).
 */

import type { Redis } from "ioredis";
import { logger } from "../log.js";
import { BoundedTtlMap } from "./boundedTtlMap.js";
import type { CacheStore } from "./store.js";

const INVALIDATION_CHANNEL = "adobos:cache:invalidate";
const L1_TTL_MS = 30_000;

export class RedisStore implements CacheStore {
  private readonly l1: BoundedTtlMap<string, unknown>;

  constructor(
    private readonly redis: Redis,
    subscriber: Redis,
    l1MaxSize = 20_000,
  ) {
    this.l1 = new BoundedTtlMap<string, unknown>(l1MaxSize, L1_TTL_MS);
    subscriber
      .subscribe(INVALIDATION_CHANNEL)
      .catch((err: unknown) =>
        logger.error({ err }, "redisStore: no se pudo suscribir"),
      );
    subscriber.on("message", (channel, key) => {
      if (channel === INVALIDATION_CHANNEL) this.l1.delete(key);
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.l1.get(key);
    if (hit !== undefined) return hit as T;
    try {
      const raw = await this.redis.get(key);
      if (raw == null) return undefined;
      const value = JSON.parse(raw) as T;
      this.l1.set(key, value);
      return value;
    } catch (err) {
      logger.warn({ err, key }, "redisStore.get degradado");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.l1.set(key, value);
    try {
      await this.redis.set(key, JSON.stringify(value), "PX", ttlMs);
    } catch (err) {
      logger.warn({ err, key }, "redisStore.set degradado (solo L1)");
    }
  }

  /** Borra en L2 y avisa a las demás réplicas para que tiren su L1. */
  async del(key: string): Promise<void> {
    this.l1.delete(key);
    try {
      await this.redis.del(key);
      await this.redis.publish(INVALIDATION_CHANNEL, key);
    } catch (err) {
      logger.warn({ err, key }, "redisStore.del degradado");
    }
  }
}
