/**
 * Response caching adapters.
 *
 * Forecast models update every 1 to 6 hours; redundant calls consume quota without adding information.
 * Cache misses or storage failures never abort request workflows.
 */

import type { CacheAdapter } from "./types.js";

interface Entry {
  readonly value: string;
  readonly expiresAtMs: number;
}

/** In-memory cache adapter for Node.js environments and testing. */
export function memoryCache(now: () => number = Date.now): CacheAdapter {
  const store = new Map<string, Entry>();
  return {
    get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (entry.expiresAtMs <= now()) {
        store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(entry.value);
    },
    set(key: string, value: string, ttlSeconds: number): Promise<void> {
      store.set(key, { value, expiresAtMs: now() + ttlSeconds * 1000 });
      return Promise.resolve();
    },
  };
}

/** Browser `sessionStorage` cache adapter. Degrades gracefully if unavailable. */
export function sessionCache(): CacheAdapter {
  const storage: Storage | null =
    typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;

  if (storage === null) return noopCache();

  return {
    get(key: string): Promise<string | null> {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return Promise.resolve(null);
        const entry = JSON.parse(raw) as Entry;
        if (entry.expiresAtMs <= Date.now()) {
          storage.removeItem(key);
          return Promise.resolve(null);
        }
        return Promise.resolve(entry.value);
      } catch {
        return Promise.resolve(null);
      }
    },
    set(key: string, value: string, ttlSeconds: number): Promise<void> {
      try {
        storage.setItem(
          key,
          JSON.stringify({ value, expiresAtMs: Date.now() + ttlSeconds * 1000 }),
        );
      } catch {
        // Quota full or private browsing: continuing uncached is safe.
      }
      return Promise.resolve();
    },
  };
}

/** No-op cache adapter. */
export function noopCache(): CacheAdapter {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
  };
}

/** Computes stable cache key from endpoint URL and query payload. */
export function cacheKey(url: string, body: URLSearchParams): string {
  const sorted = [...body.entries()].sort(([a, b], [c, d]) =>
    a === c ? b.localeCompare(d) : a.localeCompare(c),
  );
  return `soarwx:${url}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
