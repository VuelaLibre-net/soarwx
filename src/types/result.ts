/**
 * Typed result. No exceptions for expected domain conditions.
 *
 * Exceptions are thrown only for programmer bugs. An exception is never caught
 * to return `null` (NF-10 in docs/REQUIREMENTS.md).
 *
 * See docs/SPEC.md §3.
 */

export type SoarwxErrorCode =
  /** Sounding has fewer than 3 levels above ground. */
  | "INSUFFICIENT_LEVELS"
  /** Requested level whose geopotential height falls below ground. */
  | "LEVEL_BELOW_GROUND"
  /** Input outside the declared validity range of the formula. */
  | "OUT_OF_VALID_RANGE"
  /** Missing required variable. Distinct from being zero. */
  | "MISSING_VARIABLE"
  /** No heat flux: night-time or overcast skies. Not a failure. */
  | "NO_CONVECTION"
  /** Numerical integration did not converge to the required tolerance. */
  | "NOT_CONVERGED"
  /** Network or HTTP failure. Can only originate in `soarwx/openmeteo`. */
  | "FETCH_FAILED"
  /** Date is outside the model horizon. */
  | "OUT_OF_HORIZON";

/**
 * Library error. Stable identifier is `code`; `message` is English prose for
 * logs and may change without notice.
 */
export interface SoarwxError {
  readonly code: SoarwxErrorCode;
  /** English message for logs. The stable identifier is `code`. */
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * Result of an operation that might not yield an answer. Expected conditions
 * (night without convection, variable not served by model) are returned this
 * way rather than thrown: they are valid domain states, not program failures.
 */
export type Result<T, E = SoarwxError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Wraps a value as a successful result. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Builds an error result with its stable code and context. */
export const err = (
  code: SoarwxErrorCode,
  message: string,
  detail?: Readonly<Record<string, unknown>>,
): Result<never> => ({
  ok: false,
  error: detail === undefined ? { code, message } : { code, message, detail },
});

/** Narrows the type to the success case. */
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
/** Narrows the type to the error case. */
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

/** Maps the value if successful, propagating the error otherwise. */
export const mapResult = <T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? { ok: true, value: f(r.value) } : r;

/** Chains an operation that may also fail, without nesting checks. */
export const andThen = <T, U, E>(
  r: Result<T, E>,
  f: (v: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

/** Returns the value or fallback. Use only when the fallback is explicitly declared. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
