/**
 * Resultado tipado. Sin excepciones para condiciones esperadas.
 *
 * Se lanzan excepciones solo por errores de programación. Nunca se captura una
 * excepción para devolver `null` (NF-10 de docs/REQUIREMENTS.md).
 *
 * Ver docs/SPEC.md §3.
 */

export type SoarwxErrorCode =
  /** El sondeo tiene menos de 3 niveles sobre el terreno. */
  | "INSUFFICIENT_LEVELS"
  /** Se pidió un nivel cuya altura geopotencial cae bajo el terreno. */
  | "LEVEL_BELOW_GROUND"
  /** Entrada fuera del rango de validez declarado de la fórmula. */
  | "OUT_OF_VALID_RANGE"
  /** Falta una variable necesaria. Distinto de que valga cero. */
  | "MISSING_VARIABLE"
  /** Sin flujo de calor: es de noche o el cielo está cerrado. No es un fallo. */
  | "NO_CONVECTION"
  /** La integración numérica no alcanzó la tolerancia pedida. */
  | "NOT_CONVERGED"
  /** Fallo de red o HTTP. Solo puede originarse en `soarwx/openmeteo`. */
  | "FETCH_FAILED"
  /** La fecha queda fuera del alcance del modelo. */
  | "OUT_OF_HORIZON";

/**
 * Error de la librería. El identificador estable es `code`; `message` es prosa
 * en inglés para registros y puede cambiar sin aviso.
 */
export interface SoarwxError {
  readonly code: SoarwxErrorCode;
  /** Mensaje en inglés, para registros. El identificador estable es `code`. */
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * Resultado de una operación que puede no tener respuesta. Lo esperable —una
 * noche sin convección, una variable que el modelo no sirve— se devuelve así, no
 * se lanza: son estados válidos del dominio, no fallos del programa.
 */
export type Result<T, E = SoarwxError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Envuelve un valor como resultado correcto. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Construye un resultado fallido con su código estable y su contexto. */
export const err = (
  code: SoarwxErrorCode,
  message: string,
  detail?: Readonly<Record<string, unknown>>,
): Result<never> => ({
  ok: false,
  error: detail === undefined ? { code, message } : { code, message, detail },
});

/** Estrecha el tipo al caso correcto. */
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
/** Estrecha el tipo al caso fallido. */
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

/** Transforma el valor si lo hay, y propaga el error si no. */
export const mapResult = <T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? { ok: true, value: f(r.value) } : r;

/** Encadena una operación que también puede fallar, sin anidar comprobaciones. */
export const andThen = <T, U, E>(
  r: Result<T, E>,
  f: (v: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

/** Devuelve el valor o el respaldo. Úsese solo cuando el respaldo se declare. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
