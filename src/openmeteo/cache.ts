/**
 * Caché de respuestas.
 *
 * Los modelos se actualizan cada 1 a 6 horas: pedir más a menudo quema cuota
 * sin ganar información. Un fallo de caché **nunca** es un fallo de la
 * petición.
 */

import type { CacheAdapter } from "./types.js";

interface Entry {
  readonly value: string;
  readonly expiresAtMs: number;
}

/** Caché en memoria, para Node y para pruebas. */
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

/** Caché sobre `sessionStorage`, para navegador. Degrada a nada si no existe. */
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
        // Cuota llena o modo privado: seguir sin caché es correcto.
      }
      return Promise.resolve();
    },
  };
}

/** Caché que no guarda nada. */
export function noopCache(): CacheAdapter {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
  };
}

/** Clave estable a partir del cuerpo de la petición. */
export function cacheKey(url: string, body: URLSearchParams): string {
  const sorted = [...body.entries()].sort(([a, b], [c, d]) =>
    a === c ? b.localeCompare(d) : a.localeCompare(c),
  );
  return `soarwx:${url}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
