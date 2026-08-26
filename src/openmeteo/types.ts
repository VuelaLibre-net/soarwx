/** Forma de la respuesta de Open-Meteo, tal como llega. */

export type HourlySeries = readonly (number | null)[];

export interface OpenMeteoResponse {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly timezone: string;
  readonly utc_offset_seconds: number;
  readonly hourly: Readonly<Record<string, HourlySeries | readonly string[]>>;
  readonly hourly_units: Readonly<Record<string, string>>;
  readonly daily?: Readonly<Record<string, readonly string[]>>;
}

export interface OpenMeteoError {
  readonly error: true;
  readonly reason: string;
}

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
