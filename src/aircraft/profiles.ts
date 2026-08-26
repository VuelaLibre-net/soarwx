/**
 * Aircraft profiles. General physics; thresholds specific to gliders.
 *
 * This module separates two numbers that were previously conflated:
 *
 * - `hcritThresholdMs` is DrJack's **criterion** defining when thermals cease
 *   to be usable: 225 fpm, identical across the entire catalogue.
 * - `circlingSinkMs` is the aircraft's **actual sink rate** circling at 40°,
 *   derived from manufacturer-published polar curves.
 *
 * Conflating them caused selecting a glider to shift the ceiling height,
 * which RASP's criterion explicitly avoids. See `convection/hcrit.ts`.
 */

import { fpmToMs, knotsToMs } from "../units/convert.js";
import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";

/** Catalogue identifiers. Union rather than `string` enforces exhaustive maps. */
export type AircraftProfileId =
  | "rasp-reference"
  | "glider-trainer"
  | "glider-club"
  | "glider-performance"
  | "ask21"
  | "g103a-twin-ii"
  | "astir-cs"
  | "duo-discus"
  | "dg1001-club"
  | "ls8e-15"
  | "ls8e-18"
  | "ash25";

export interface AircraftProfile {
  readonly id: AircraftProfileId;
  /**
   * Minimum sink rate in straight flight from manufacturer. `null` when the
   * profile is a reference convention rather than an aircraft (see `RASP_REFERENCE`).
   */
  readonly minSinkMs: MPerS | null;
  /** Sink rate circling in thermals at the reference bank angle. */
  readonly circlingSinkMs: MPerS;
  /**
   * Climb rate below which a thermal is no longer considered usable.
   * Defines `hcrit` and is **not** an aircraft property.
   */
  readonly hcritThresholdMs: MPerS;
  /** Above this surface wind speed, `w*` is suppressed. */
  readonly maxSurfaceWindMs: MPerS;
  /** Minimum turn radius, for comparison with thermal core size. */
  readonly minTurnRadiusM: Metres;
  /** Vario reading below which thermals are considered unprofitable. */
  readonly minUsableClimbMs: MPerS;
}

/**
 * `hcrit` threshold.
 *
 * DrJack describes this as a "rough estimate of sink rate for a sailplane or
 * hang glider turning and maneuvering to stay within a thermal": a practical,
 * deliberately conservative figure, not any single model's polar. Retained
 * intact so our ceiling remains directly comparable to RASP.
 *
 * @source Glendening, J. ("DrJack"), RASP BLIPMAP, definition of hcrit.
 */
export const RASP_HCRIT_THRESHOLD_MS: MPerS = fpmToMs(225); // 1.143 m/s

/**
 * Reference bank angle for thermalling.
 *
 * The current FAA glider manual explains that 40° often yields better climb
 * than 30° by staying in the stronger core, whereas sink penalty increases
 * sharply beyond ~45°.
 *
 * @source FAA Glider Flying Handbook, FAA-H-8083-13B, ch. 10.
 */
export const REFERENCE_BANK_DEG = 40;

/**
 * Factor by which minimum sink increases when banking compared to straight flight.
 *
 * In a coordinated turn, load factor is `n = 1/cos φ`. For a parabolic polar
 * flown at optimal speed for the new load factor, minimum sink speed scales
 * as `n^(1/2)` and sink rate as `n^(3/2)`. At 40°: `n = 1.3054`, speed increases
 * by 14 % and sink rate by 49 %.
 *
 * @source Classical glider turning mechanics; +14 % / +49 % at 40° matches
 *         figures published by the Soaring Society of America.
 */
export function circlingSinkFactor(bankDeg: number): number {
  return Math.pow(1 / Math.cos((bankDeg * Math.PI) / 180), 1.5);
}

/** Factor at `REFERENCE_BANK_DEG`. 1.4914. */
export const BANK_40_SINK_FACTOR = circlingSinkFactor(REFERENCE_BANK_DEG);

/**
 * Model-independent fields.
 *
 * `maxSurfaceWindMs` is Allen's cutoff on `w*`: it represents meteorology,
 * not aircraft capabilities, hence identical across the catalogue. The paper
 * states "12.87 m/s (25 knots)", though exact 25 kt is 12.8611 m/s: the value
 * actually used in the author's calculations is preserved, with the 0.017 kt
 * difference noted in `ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS`.
 *
 * `minTurnRadiusM` and `minUsableClimbMs` are aircraft properties in principle,
 * but lack manufacturer data and are unused by current functions: inventing
 * per-model figures would be unsourced noise.
 *
 * @source Allen, M. J. (2006), AIAA 2006-1510, §II (wind cutoff).
 */
const SHARED = {
  maxSurfaceWindMs: mps(12.87),
  minTurnRadiusM: m(40),
  minUsableClimbMs: mps(0.5),
} as const;

/**
 * Builds an aircraft profile from published straight-flight minimum sink.
 *
 * The derivation lives here rather than in comments: no aircraft in the
 * catalogue declares a literal `circlingSinkMs`.
 */
function glider(id: AircraftProfileId, minSinkMs: number): AircraftProfile {
  return {
    id,
    minSinkMs: mps(minSinkMs),
    circlingSinkMs: mps(minSinkMs * BANK_40_SINK_FACTOR),
    hcritThresholdMs: RASP_HCRIT_THRESHOLD_MS,
    ...SHARED,
  };
}

/**
 * DrJack's baseline criterion, modeled as an aircraft profile.
 *
 * Not a physical model: serves as a reference to reproduce exact RASP output
 * for comparison. Since sink equals the threshold, vario readings drop to
 * zero at `hcrit`.
 *
 * @source Glendening, J. ("DrJack"), RASP BLIPMAP.
 */
export const RASP_REFERENCE: AircraftProfile = {
  id: "rasp-reference",
  minSinkMs: null,
  circlingSinkMs: RASP_HCRIT_THRESHOLD_MS,
  hcritThresholdMs: RASP_HCRIT_THRESHOLD_MS,
  ...SHARED,
};

// ---------------------------------------------------------------------------
// Generic classes.
//
// Generic conventions for users not selecting a specific aircraft. All three
// values derive from the same manufacturer table as specific models below.
// ---------------------------------------------------------------------------

/** Two-seater trainer at double occupancy, or club glider with buggy wings. */
export const GLIDER_TRAINER: AircraftProfile = glider("glider-trainer", 0.7);

/**
 * Club glider. Default library profile.
 *
 * 0.65 m/s in straight flight represents the ASK 21, the most widespread club
 * two-seater, remaining conservative relative to modern single-seaters.
 */
export const GLIDER_CLUB: AircraftProfile = glider("glider-club", 0.65);

/** Modern 15m to 18m single-seater. */
export const GLIDER_PERFORMANCE: AircraftProfile = glider("glider-performance", 0.55);

// ---------------------------------------------------------------------------
// Specific models.
//
// Note on table consistency: manufacturers publish minimum sink at their chosen
// reference mass, so figures are not strictly comparable. The Astir CS manual
// shows this: 0.6 m/s at 350 kg and 0.7 m/s at 450 kg. Reference mass is noted
// where provided by the source.
// ---------------------------------------------------------------------------

/** Schleicher ASK 21. 0.65 m/s, minimum wing loading 24.5 kg/m². @source Schleicher. */
export const ASK_21: AircraftProfile = glider("ask21", 0.65);

/**
 * Grob G103A Twin II Acro. 0.64 m/s.
 *
 * Grob no longer publishes glider data: figure is from the type certificate data sheet.
 * Dual occupancy listings report up to 0.75 m/s.
 *
 * @source Type Certificate Data Sheet, G103A Twin II.
 */
export const G103A_TWIN_II: AircraftProfile = glider("g103a-twin-ii", 0.64);

/**
 * Grob Astir CS. 0.6 m/s at 75 km/h and 350 kg (0.7 m/s at 85 km/h and 450 kg).
 *
 * The manual specifies 80-85 km/h thermalling speed vs 75 km/h minimum sink
 * speed (+7 to +13 %), matching the `n^(1/2)` scaling in `circlingSinkFactor` at 40°.
 *
 * @source Grob, Astir CS 77 Flight and Maintenance Manual, "Flying Performance
 *         — Glide Polar Curve".
 */
export const ASTIR_CS: AircraftProfile = glider("astir-cs", 0.6);

/**
 * Schempp-Hirth Duo Discus. 0.58 m/s, L/D 45.
 *
 * @source Factory polar, recomputed from 1994 Idaflieg / DLR flight tests.
 */
export const DUO_DISCUS: AircraftProfile = glider("duo-discus", 0.58);

/** DG-1001 Club. 0.62 m/s, L/D > 40. @source DG Aviation. */
export const DG_1001_CLUB: AircraftProfile = glider("dg1001-club", 0.62);

/** LS8-e neo, 15 m. 0.59 m/s, L/D 43. @source DG Aviation. */
export const LS8E_15: AircraftProfile = glider("ls8e-15", 0.59);

/** LS8-e neo, 18 m. 0.51 m/s, L/D 48. @source DG Aviation. */
export const LS8E_18: AircraftProfile = glider("ls8e-18", 0.51);

/** Schleicher ASH 25. 0.49 m/s, L/D > 57. @source Schleicher, ASH 25 M/Mi datasheet. */
export const ASH_25: AircraftProfile = glider("ash25", 0.49);

/** Complete catalogue in display order. */
export const AIRCRAFT_PROFILES: readonly AircraftProfile[] = [
  GLIDER_TRAINER,
  GLIDER_CLUB,
  GLIDER_PERFORMANCE,
  ASK_21,
  G103A_TWIN_II,
  ASTIR_CS,
  DUO_DISCUS,
  DG_1001_CLUB,
  LS8E_15,
  LS8E_18,
  ASH_25,
  RASP_REFERENCE,
];

/** Looks up a profile by identifier. Returns `undefined` if not found. */
export function findAircraftProfile(id: string): AircraftProfile | undefined {
  return AIRCRAFT_PROFILES.find((profile) => profile.id === id);
}

/** Exact 25 knots, for callers preferring knot-rounded cutoffs. */
export const ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS: MPerS = knotsToMs(25);
