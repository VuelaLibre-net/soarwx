# API reference for `soarwx`

**Version 0.12.0.** The API is unstable until 1.0.0.

`SPEC.md` defines the contract and what falls outside it. This document lists
**everything the package exports**, with the actual signature and one example per
module. The tables are generated from the published `.d.ts` files: if a signature
changes, this document changes with it.

## How to read this reference

**Everything is SI, and the name says so.** `tempK`, `pressurePa`, `zAglM`, `wStarMs`,
`capeJkg`. A property called `alt` or `temp` does not exist. Heights are
`AglM` (above ground level) or `MslM` (above mean sea level), never bare. Conversions
to knots, feet or km/h live in `soarwx/units` and are for display, not for
computation.

**Types are branded.** `Kelvin` is not `number`: it is `number & { [brand]: "K" }`.
Passing pascals where kelvin is expected does not compile. To build a branded
value, use the short constructors: `K(300)`, `Pa(90900)`, `m(1500)`, `mps(3.2)`.

**Expected conditions return `Result`, they don't throw.** A night without convection,
a sounding missing upper levels, or a variable the model does not serve are valid
states, not failures. They come back as `{ ok: false, error }` with a stable `code`.
Only the impossible — an out-of-domain argument — throws.

**The core never touches the network and never returns text.** Everything returns
numbers and enums. Spanish strings live in `soarwx/i18n/es`, English strings in
`soarwx/i18n/en`, and the only function that makes HTTP requests is in
`soarwx/openmeteo`.

## Installation

```bash
pnpm add soarwx
```

Pure ESM, `sideEffects: false`, fifteen entry points with their own `types`:

| Import | What it provides |
|---|---|
| `soarwx` | `Result`, `Site`, `RidgeSpec`, attribution, version |
| `soarwx/units` | Branded types, physical constants, conversions |
| `soarwx/thermo` | Saturation, LCL, parcel ascent, θ and θe |
| `soarwx/sounding` | Profile assembly, interpolation, inversions, wind |
| `soarwx/convection` | Heat flux, `w*`, updraft profile, `hcrit`, trigger |
| `soarwx/clouds` | Mixed layer, cumulus base, overdevelopment, ceiling |
| `soarwx/stability` | LI, KI, Total Totals, CAPE as risk |
| `soarwx/orographic` | Ridge lift, Scorer parameter, wave |
| `soarwx/aircraft` | `AircraftProfile` and the `GLIDER_CLUB` preset |
| `soarwx/forecast` | Factors, vetoes, score, windows, confidence |
| `soarwx/report` | `computeDay`: the full day, pure |
| `soarwx/openmeteo` | **The only module with network access** |
| `soarwx/render` | SVG string generators, zero dependencies |
| `soarwx/i18n/es` | Enum → Spanish text |
| `soarwx/i18n/en` | Enum → English text |

## The short path

A full forecast from the browser, with two models and a confidence measure:

```ts
import { fetchSoaringDay } from "soarwx/openmeteo";
import { GLIDER_CLUB } from "soarwx/aircraft";
import * as en from "soarwx/i18n/en";
import { m } from "soarwx/units";
import type { Site } from "soarwx";

const fuentemilanos: Site = {
  name: "Fuentemilanos",
  icao: "LEFM",
  latDeg: 40.9167,
  lonDeg: -4.2333,
  elevationMslM: m(1013),
  timezone: "Europe/Madrid",
  surface: { type: "cropland" },
};

const result = await fetchSoaringDay(fuentemilanos, "2026-08-19", {
  models: ["icon_eu", "gfs_seamless"],
  profile: GLIDER_CLUB,
});

if (!result.ok) throw new Error(result.error.code);

const { day } = result.value;
const best = day.best;
if (best !== null) {
  console.log(`${en.describeLevel(best.score.level)} at ${en.formatHour(best.timeUtc, fuentemilanos.timezone)}`);
  console.log(`ceiling ${Math.round(best.ceiling.aglM)} m AGL, ${en.describeCeilingLimit(best.ceiling.limitedBy)}`);
  for (const veto of best.score.vetoes) console.log("⚠", en.describeVeto(veto.id));
}
console.log(day.attribution);   // must be displayed: CC BY 4.0
```

## The long path

`fetchSoaringDay` is sugar over two separable pieces. If you already have the data
— from a cache, a fixture, or another provider — skip the network and call
`computeDay`, which is pure:

```ts
import { computeDay } from "soarwx/report";
import { renderSkewT } from "soarwx/render";
import { m } from "soarwx/units";

const day = computeDay({
  site: fuentemilanos,
  hourly,                       // HourlyObservation[], already in SI
  dateLocal: "2026-08-19",
  sunriseUtc: "2026-08-19T05:31",
  sunsetUtc: "2026-08-19T19:09",
});

if (day.ok && day.value.best !== null) {
  const svg = renderSkewT(day.value.best.sounding, {
    parcelFromK: day.value.best.sounding.surface.tempK,
    ceilingMslM: m(fuentemilanos.elevationMslM + day.value.best.ceiling.aglM),
  });
  container.innerHTML = svg;
}
```

That separation is why this library exists: everything above `computeDay` is
tested from fixtures, with no network and no clock.

## Errors

Each `SoarwxError` carries a stable `code` — the `message` is English prose for
logs and may change — plus an optional `detail` with the values that caused it.

```ts
import { isErr } from "soarwx";
import { criticalHeight } from "soarwx/convection";
import { GLIDER_CLUB } from "soarwx/aircraft";

const climb = criticalHeight(wStarMs, ziAglM, GLIDER_CLUB);
if (isErr(climb)) {
  if (climb.error.code === "NO_CONVECTION") return "it's night";  // valid state
  throw new Error(climb.error.code);
}
```

`NO_CONVECTION` is not a failure: there are just no thermals. `MISSING_VARIABLE`
means the model did not serve the data, and it is **never** silently replaced by
zero: the substitution, if any, is declared in `quality.estimated`.

---

## Module reference

### `soarwx`

The root only exports cross-cutting concerns: the `Result` type, the site
description and the mandatory attribution. It contains no physics.

`Site` is the input to everything. `elevationMslM` is not optional: it anchors
AGL, determines which pressure levels fall below ground, and is sent to
Open-Meteo so that downscaling uses the airfield elevation rather than that of
a 90 m grid cell. `timezone` isn't optional either: requesting a day with
`timezone=UTC` makes the Spanish "day" run from 02:00 to 02:00 local, losing
the thermal afternoon.

```ts
import { isOk, OPEN_METEO_ATTRIBUTION } from "soarwx";
import type { Result, Site } from "soarwx";
import { m, deg } from "soarwx/units";

const site: Site = {
  name: "Fuentemilanos",
  icao: "LEFM",
  latDeg: 40.9167,
  lonDeg: -4.2333,
  elevationMslM: m(1013),
  timezone: "Europe/Madrid",
  surface: { type: "cropland" },
  ridges: [
    {
      name: "La Mujer Muerta",
      bearingDeg: deg(68),      // bearing along the ridge axis, 0..180
      slopeDeg: deg(16),
      crestMslM: m(2197),
      lengthM: m(11000),
    },
  ],
};

// Terrain enters as data. There is not a single hardcoded site in the
// library: `grep -ri "guadarrama" src/` is empty, and a test enforces it.

function height<T extends { aglM: number }>(r: Result<T>): number | null {
  return isOk(r) ? r.value.aglM : null;
}
```

**Functions**

| Signature | What it does |
|---|---|
| `const andThen: <T, U, E>(r: Result<T, E>, f: (v: T) => Result<U, E>) => Result<U, E>` | Chains an operation that may also fail, without nesting checks. |
| `const err: (code: SoarwxErrorCode, message: string, detail?: Readonly<Record<string, unknown>>) => Result<never>` | Builds an error result with its stable code and context. |
| `const mapResult: <T, U, E>(r: Result<T, E>, f: (v: T) => U) => Result<U, E>` | Maps the value if successful, propagating the error otherwise. |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `isErr` | `const isErr: <T, E>(r: Result<T, E>) => r is { ok: false; error: E; }` | Narrows the type to the error case. |
| `isOk` | `const isOk: <T, E>(r: Result<T, E>) => r is { ok: true; value: T; }` | Narrows the type to the success case. |
| `ok` | `const ok: <T>(value: T) => Result<T, never>` | Wraps a value as a successful result. |
| `OPEN_METEO_ATTRIBUTION` | `const OPEN_METEO_ATTRIBUTION = "Weather data from Open-Meteo.com (https://open-meteo.com), CC BY 4.0 licence."` | Attribution required by the CC BY 4.0 licence for Open-Meteo data. |
| `SOARWX_VERSION` | `const SOARWX_VERSION = "0.12.0"` | Library version. |
| `unwrapOr` | `const unwrapOr: <T, E>(r: Result<T, E>, fallback: T) => T` | Returns the value or fallback. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Result` | `type Result<T, E = SoarwxError> = { readonly ok: true; readonly value: T; } \| { readonly ok: false; readonly error: E; }` | Result of an operation that might not yield an answer. |
| `RidgeSpec` | `interface RidgeSpec — 5 fields` | Ridge geometry as data. |
| `Site` | `interface Site — 8 fields` | Site to evaluate. |
| `SoarwxError` | `interface SoarwxError — 3 fields` | Library error. |
| `SoarwxErrorCode` | `type SoarwxErrorCode = …` | Typed result. |
| `SurfaceSpec` | `interface SurfaceSpec — 4 fields` | Site surface characteristics. |
| `SurfaceType` | `type SurfaceType = "cropland" \| "forest" \| "grass" \| "arid" \| "urban" \| "water" \| "snow"` | — |


### `soarwx/units`

Branded types, physical constants and conversions. This is the module that
prevents the predecessor's recurring bug: mixing km/h with m/s, or feet with
metres, in a formula that still compiles and returns a plausible number.

Derived constants are **derived**, not tabulated. `GAMMA_D` is `G / CP`, not
0.0098. `FEET_PER_METRE` is `1 / 0.3048`, not 3.28084: tabulating it introduced
a round-trip error of 3·10⁻⁸ that no reasonable tolerance test detects.

The constructors (`K`, `Pa`, `m`, `mps`, `deg`, `wm2`, `jkg`, `kgkg`) and the types
they produce carry no description in the table: the signature **is** the
documentation.

```ts
import { K, Pa, m, mps, celsiusToK, msToKnots, hPaToPa, GAMMA_D, CP, G } from "soarwx/units";
import type { Kelvin, MPerS } from "soarwx/units";

const t: Kelvin = celsiusToK(34.6);        // 307.75 K
const p = hPaToPa(909);                    // 90900 Pa
const wind: MPerS = mps(5.2);

msToKnots(wind);                           // 10.1 — for display only
GAMMA_D === G / CP;                        // true: derived, not tabulated

// Branding is what prevents the unit bug:
// saturationVapourPressure(p)   ← won't compile: Pascal where Kelvin expected
```

**Functions**

| Signature | What it does |
|---|---|
| `const celsiusToK: (c: number) => Kelvin` | — |
| `const deg: (v: number) => Degrees` | — |
| `const feetToM: (ft: number) => Metres` | — |
| `const fpmToMs: (fpm: number) => MPerS` | Feet per minute to metres per second. |
| `const hPaToPa: (hpa: number) => Pascal` | — |
| `const jkg: (v: number) => JPerKg` | — |
| `const K: (v: number) => Kelvin` | — |
| `const kgkg: (v: number) => KgPerKg` | — |
| `const kmhToMs: (kmh: number) => MPerS` | — |
| `const knotsToMs: (kt: number) => MPerS` | — |
| `const kToCelsius: (t: Kelvin) => number` | — |
| `const m: (v: number) => Metres` | — |
| `const mps: (v: number) => MPerS` | — |
| `const msToFpm: (v: MPerS) => number` | — |
| `const msToKmh: (v: MPerS) => number` | — |
| `const msToKnots: (v: MPerS) => number` | — |
| `const mToFeet: (z: Metres) => number` | — |
| `const normaliseBearing: (d: number) => Degrees` | Normalizes a bearing to the interval [0, 360). |
| `const Pa: (v: number) => Pascal` | — |
| `const paToHPa: (p: Pascal) => number` | — |
| `const wm2: (v: number) => WPerM2` | — |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CP` | `const CP = 1004.67` | Specific heat of dry air at constant pressure, J/(kg·K). |
| `CPV` | `const CPV = 1879` | Specific heat of water vapour at constant pressure, J/(kg·K). |
| `EPS` | `const EPS: number` | Ratio of gas constants, Rd/Rv. |
| `G` | `const G = 9.80665` | Standard gravitational acceleration, m/s². |
| `GAMMA_D` | `const GAMMA_D: number` | Dry adiabatic lapse rate, K/m. |
| `KAPPA` | `const KAPPA: number` | Poisson constant, Rd/cp. |
| `LV_SLOPE` | `const LV_SLOPE = 2370` | Temperature dependence slope of latent heat of vaporisation, J/(kg·K). |
| `LV0` | `const LV0 = 2501000` | Latent heat of vaporisation at 0 °C, J/kg. |
| `P0` | `const P0: Pascal` | Reference pressure for potential temperature, Pa. |
| `RD` | `const RD = 287.05` | Specific gas constant for dry air, J/(kg·K). |
| `RV` | `const RV = 461.5` | Specific gas constant for water vapour, J/(kg·K). |
| `T0_CELSIUS` | `const T0_CELSIUS: Kelvin` | Zero Celsius in kelvin. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Branded` | `type Branded<T, B extends string> = T & { readonly [brand]: B; }` | Number carrying a compile-time unit brand. |
| `Degrees` | `type Degrees = Branded<number, "deg">` | — |
| `JPerKg` | `type JPerKg = Branded<number, "J/kg">` | — |
| `Kelvin` | `type Kelvin = Branded<number, "K">` | — |
| `KgPerKg` | `type KgPerKg = Branded<number, "kg/kg">` | — |
| `Metres` | `type Metres = Branded<number, "m">` | — |
| `MPerS` | `type MPerS = Branded<number, "m/s">` | — |
| `Pascal` | `type Pascal = Branded<number, "Pa">` | — |
| `WPerM2` | `type WPerM2 = Branded<number, "W/m2">` | — |


### `soarwx/thermo`

Parcel thermodynamics. Saturation by Bolton, LCL by Bolton, dry and
pseudoadiabatic ascent by adaptive Runge-Kutta.

Two details that look minor but aren't. The **LCL uses the specific heat of
moist air**, not dry: with dry `cp`, at 45 °C and 40 % humidity, the result
departs 1.9 % from the exact Romps (2017) LCL; with `cpm`, 0.5 %. And the
**latent heat depends on temperature**: with constant `Lv`, the reference θe
drifts 2.4 K in a pseudoadiabatic ascent from 900 to 500 hPa starting at 30 °C;
with `latentHeatOfVaporisation(T)`, 0.5 K.

The integrator **does not accept a step outside tolerance**. If it does not
converge, it returns an error. A silently wrong number is worse than none.

```ts
import { lcl, saturationVapourPressure, potentialTemperature, moistAdiabaticLift } from "soarwx/thermo";
import { K, Pa, celsiusToK, hPaToPa } from "soarwx/units";

saturationVapourPressure(K(273.15));       // 611.2 Pa — the textbook value

const t = celsiusToK(34.6);
const td = celsiusToK(6.8);
const p = hPaToPa(909);

const base = lcl(t, td, p);
base.heightAboveParcelM;                   // 3461 m above the starting point
base.pressurePa;                           // 60660 Pa

// The Espy rule the predecessor used gave 3392 m for the same case:
// (34.6 - 6.8) * 122. At spreads of 28 °C the approximation breaks down.

potentialTemperature(t, p);                // 316.3 K — nearly 9 K above T
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function checkSaturationRange(tempK: Kelvin): SoarwxError \| null` | Checks whether temperature falls within Bolton (1980) eq. | Bolton (1980) |
| `function dewpointFromMixingRatio(mixingRatioKgKg: KgPerKg, pressurePa: Pascal): Kelvin` | Dewpoint from mixing ratio and pressure. | Wallace & Hobbs (1980) |
| `function dewpointFromRelativeHumidity(tempK: Kelvin, rhFrac: number): Kelvin` | Dewpoint from relative humidity. | Bolton (1980) |
| `function dewpointFromVapourPressure(vapourPressurePa: Pascal): Kelvin` | Dewpoint from vapour pressure by analytical inversion of Bolton eq. | Bolton (1980) |
| `function dryAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal): Kelvin` | Dry adiabatic lift: temperature when moving a parcel to a different pressure while conserving potential temperature. | Poisson |
| `function latentHeatOfVaporisation(tempK: Kelvin): number` | Temperature-dependent latent heat of vaporisation. | T (1980) |
| `function lcl(tempK: Kelvin, dewpointK: Kelvin, pressurePa: Pascal): LclResult` | Full LCL calculation: temperature, pressure, and height above starting level. | Bolton (1980) |
| `function lclTemperature(tempK: Kelvin, dewpointK: Kelvin): Kelvin` | Temperature at the LCL. | Bolton (1980) |
| `function mixingRatio(dewpointK: Kelvin, pressurePa: Pascal): KgPerKg` | Mixing ratio from dewpoint. | Wallace & Hobbs |
| `function moistAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal, opts?: IntegrationOptions): Result<Kelvin>` | Saturated pseudoadiabatic ascent via adaptive-step numerical integration. | Wallace & Hobbs |
| `function moistHeatCapacity(specificHumidity: number): number` | Specific heat of moist air at constant pressure. | Romps (2017) |
| `function potentialTemperature(tempK: Kelvin, pressurePa: Pascal): Kelvin` | Potential temperature. | Poisson |
| `function relativeHumidity(tempK: Kelvin, dewpointK: Kelvin): number` | Relative humidity with respect to liquid water, as fraction 0..1. | Bolton (1980) |
| `function saturationMixingRatio(tempK: Kelvin, pressurePa: Pascal): KgPerKg` | Saturation mixing ratio. | Wallace & Hobbs |
| `function saturationVapourPressure(tempK: Kelvin): Pascal` | Saturation vapour pressure over liquid water. | Bolton (1980) |
| `function specificHumidity(mixingRatioKgKg: KgPerKg): number` | Specific humidity from mixing ratio. | Wallace & Hobbs |
| `function temperatureFromPotential(thetaK: Kelvin, pressurePa: Pascal): Kelvin` | Inverse of {@link potentialTemperature}: temperature at a given pressure. | Poisson |
| `function virtualPotentialTemperature(tempK: Kelvin, pressurePa: Pascal, mixingRatioKgKg: KgPerKg): Kelvin` | Virtual potential temperature. | Stull |
| `function virtualTemperature(tempK: Kelvin, mixingRatioKgKg: KgPerKg): Kelvin` | Virtual temperature. | Allen (2006) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `SATURATION_VALID_RANGE` | `const SATURATION_VALID_RANGE: { readonly minK: Kelvin; readonly maxK: Kelvin; }` | Validity range declared by Bolton for eq. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `IntegrationOptions` | `interface IntegrationOptions — 4 fields` | — |
| `LclResult` | `interface LclResult — 3 fields` | — |


### `soarwx/sounding`

Assembles the vertical profile from three sources that don't fit together on
their own: the surface, pressure levels and fixed height levels (10/80/120/180 m).

**Prunes levels below ground.** At a 1000 m site, the 1000, 975, 950 and often
925 hPa levels are below the terrain; assembling without pruning produces garbage.
Pruning uses `geopotential_height`, never `surface_pressure`: the two series are
not mutually consistent in the Open-Meteo response.

**Height levels are anchored to the model's geopotential column**, not to
surface pressure. Anchoring to `surface_pressure` produced a **non-monotonic**
profile: the 80 m level came out at higher pressure than the 900 hPa level,
which sits 21 m lower.

Wind is averaged by **components**, never by degrees. The arithmetic mean of
350° and 10° is 180° — exactly the opposite heading.

```ts
import { buildSounding, interpolateAtAgl, findInversions, meanWind, maxGapBelow } from "soarwx/sounding";
import { m } from "soarwx/units";

const built = buildSounding({ site, timeUtc: "2026-08-19T14:00", surface, pressureLevels, heightLevels });
if (!built.ok) throw new Error(built.error.code);
const sounding = built.value;

sounding.quality.levelsDiscardedBelowGround;  // how many fell below the terrain
sounding.quality.maxVerticalGapM;             // the largest remaining gap

// Temperature at 1500 m above the field, interpolating linearly in log-p:
const level = interpolateAtAgl(sounding, m(1500));
if (level.ok) level.value.tempK;

// Inversions and stable layers in the first 5 km, with 100 m minimum thickness:
for (const layer of findInversions(sounding)) {
  layer.kind;          // "inversion" | "isothermal" | "stable"
  layer.baseMslM;
  layer.strengthK;
}

// Mixed-layer mean wind, averaging U/V components rather than degrees:
const mean = meanWind(
  sounding.levels
    .filter((l) => l.geopotentialMslM < 3000)
    .map((l) => ({ wind: { speedMs: l.windSpeedMs, fromDeg: l.windFromDeg }, weight: 1 })),
);
mean.speedMs;
mean.fromDeg;
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function buildSounding(input: SoundingInput): Result<Sounding>` | Assembles the atmospheric sounding: surface, AGL height levels, and pressure levels, ordered by strictly descending pressure with all sub-surface levels filtered out. | Requirements R-1.1 through R-1.5 from docs/REQUIREMENTS.md |
| `function findInversions(sounding: Sounding, maxMslM?: Metres, minThicknessM?: number): readonly StableLayer[]` | Identifies stable layers and temperature inversions below a specified altitude. | Standard definitions of inversion and dry static stability (dθ/dz > 0) |
| `function fromComponents(uMs: number, vMs: number): WindVector` | Reconstructs wind speed and meteorological direction from Cartesian components. | Standard meteorological convention |
| `function heightLevelsToLevels(context: HeightLevelContext, raw: readonly RawHeightLevel[]): readonly Level[]` | Converts raw AGL height levels into sounding levels. | Mixing ratio conservation in convective mixed layer (Stull |
| `function interpolateAtAgl(sounding: Sounding, aglM: Metres): Result<Level>` | Interpolates sounding level at specified height above ground level (AGL). |  |
| `function interpolateAtHeight(sounding: Sounding, mslM: Metres): Result<Level>` | Interpolates sounding level at specified geopotential altitude above MSL. | Standard atmospheric sounding interpolation |
| `function interpolateAtPressure(sounding: Sounding, pressurePa: Pascal): Result<Level>` | Interpolates sounding level at specified pressure. | Log-pressure interpolation |
| `function maxGapBelow(sounding: Sounding, topMslM: Metres): Metres` | Largest vertical gap between consecutive levels below a specified ceiling. | Requirements R-1.4b from docs/REQUIREMENTS.md |
| `function meanWind(samples: readonly { readonly wind: WindVector; readonly weight: number; }[]): WindVector` | Weighted vector mean of wind observations (typically weighted by layer depth). | Vector mean wind |
| `function pressureAtHeight(surfacePressurePa: Pascal, surfaceTempK: Kelvin, tempAtHeightK: Kelvin, mixingRatioKgKg: number, depthM: Metres): Pascal` | Pressure at height above surface via the hypsometric equation. | Wallace & Hobbs |
| `function pressureFromGeopotentialProfile(column: readonly PressureHeightPair[], targetMslM: Metres): Pascal \| null` | Pressure at height by linearly interpolating `ln(p)` against model geopotential height. | Hydrostatic log-linear relation |
| `function shearBetween(lower: WindVector, upper: WindVector, depthM: Metres): ShearResult` | Vector wind shear between two wind observations separated by vertical depth. | Standard vector wind shear definition |
| `function toComponents(speedMs: MPerS, fromDeg: Degrees): WindComponents` | Decomposes meteorological wind (direction FROM which wind blows) into Cartesian components. | Standard meteorological convention |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `ISOTHERMAL_LAPSE_K_PER_KM` | `const ISOTHERMAL_LAPSE_K_PER_KM = 0.5` | Below this absolute lapse rate, the layer is classified as isothermal. |
| `MIN_LAYER_THICKNESS_M` | `const MIN_LAYER_THICKNESS_M = 100` | Minimum thickness required to identify a stable layer. |
| `STABLE_THETA_GRADIENT_K_PER_KM` | `const STABLE_THETA_GRADIENT_K_PER_KM = 2` | Stability threshold in potential temperature gradient. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `BuildOptions` | `interface BuildOptions — 2 fields` | — |
| `HeightLevelContext` | `interface HeightLevelContext — 5 fields` | — |
| `Level` | `interface Level — 8 fields` | — |
| `LevelSource` | `type LevelSource = "surface" \| "pressure_level" \| "height_level" \| "interpolated"` | — |
| `PressureHeightPair` | `interface PressureHeightPair — 2 fields` | (pressure, height) pair defining model p(z) relation. |
| `RawHeightLevel` | `interface RawHeightLevel — 4 fields` | — |
| `RawPressureLevel` | `interface RawPressureLevel — 7 fields` | — |
| `ShearResult` | `interface ShearResult — 3 fields` | — |
| `Sounding` | `interface Sounding — 5 fields` | — |
| `SoundingInput` | `interface SoundingInput — 7 fields` | — |
| `SoundingQuality` | `interface SoundingQuality — 10 fields` | — |
| `StableLayer` | `interface StableLayer — 5 fields` | — |
| `StableLayerKind` | `type StableLayerKind = "inversion" \| "isothermal" \| "stable"` | — |
| `SurfaceState` | `interface SurfaceState — 12 fields` | — |
| `WindComponents` | `interface WindComponents — 2 fields` | — |
| `WindVector` | `interface WindVector — 2 fields` | — |


### `soarwx/convection`

The core of the library's value. The chain goes: radiation → sensible heat flux
→ `w*` → updraft profile → `hcrit`.

**The sign of the model's flux depends on the model.** ICON serves it positive
downward (−243 W/m² at midday), GFS positive upward (+417 W/m²). `detectFluxSign`
figures it out by correlating with shortwave radiation, because hard-coding it
breaks the moment Open-Meteo adds a model. Using the raw value with ICON yields
zero convection all day, with no exception and a normal-looking report.

**`boundary_layer_height` is not the thermal top.** ICON does not serve it at all;
in GFS it peaks at 18:00 local, after thermals have died. The parcel method is
mandatory, not an alternative.

**`w*` uses potential temperature**, not absolute: at 900 hPa that's 9 K of
difference. And it's zeroed above the aircraft profile's wind cutoff (12.87 m/s),
because beyond that thermals stop being usable.

```ts
import {
  surfaceHeatFlux, convectiveVelocityScale, criticalHeight,
  meanClimbOverBand, detectFluxSign,
} from "soarwx/convection";
import { potentialTemperature } from "soarwx/thermo";
import { GLIDER_CLUB } from "soarwx/aircraft";
import { K, Pa, m, mps, wm2, celsiusToK, hPaToPa } from "soarwx/units";

// 1. Flux sign, inferred from the day's series, not hard-coded.
const convention = detectFluxSign(samples);      // "up_positive" | "down_positive"

// 2. Full energy chain: Rn -> G -> H -> Qov.
const flux = surfaceHeatFlux({
  shortwaveDownWm2: wm2(894),
  surfaceTempK: celsiusToK(34.6),
  surfaceDewpointK: celsiusToK(6.8),
  surfacePressurePa: hPaToPa(909),
  cloudCoverFrac: 0.04,
  surfaceType: "cropland",
});
flux.netRadiationWm2;    // 617 W/m2
flux.sensibleHeatWm2;    // 346 W/m2   (the predecessor used 0.30 * 894 = 268)
flux.source;             // "model" | "energy_balance" — always declared

// 3. Deardorff's convective velocity scale.
const w = convectiveVelocityScale({
  virtualHeatFluxKMs: flux.virtualHeatFluxKMs,
  mixingHeightAglM: m(3365),
  surfacePotentialTempK: potentialTemperature(celsiusToK(34.6), hPaToPa(909)),
  surfaceWindMs: mps(2.57),
  profile: GLIDER_CLUB,
});
if (!w.ok) throw new Error(w.error.code);       // NO_CONVECTION means it's night
w.value.wStarMs;          // 3.28 m/s
w.value.suppressedByWind; // true if wind exceeded the cutoff

// 4. Practical ceiling: where the core stops offsetting the sink while circling.
const h = criticalHeight(w.value.wStarMs, m(3365), GLIDER_CLUB);
if (h.ok) {
  h.value.hcritAglM;      // 2364 m AGL
  h.value.peakHeightAglM; // 642 m — the peak is low, not at mid-layer
  h.value.peakClimbMs;    // 2.79 m/s
}

// 5. What the vario would show, averaged over the working band.
const climb = meanClimbOverBand(w.value.wStarMs, m(3365), GLIDER_CLUB);
if (climb.ok) climb.value;   // 1.11 m/s
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function bowenRatioFor(type: SurfaceType, soilMoistureFrac?: number): number` | Bowen ratio linearly interpolated between dry and wet soil moisture conditions. | Stull |
| `function buoyancyShearRatio(input: BuoyancyShearInput): Result<BuoyancyShearResult>` | Buoyancy to shear ratio and resulting thermal organisation quality. | Glendening (DrJack) |
| `function convectiveVelocityScale(input: WStarInput): Result<WStarResult>` | Deardorff convective velocity scale. | Allen (2006) |
| `function criticalHeight(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile): Result<CriticalHeightResult>` | Altitude where core updraft strength drops below the profile's `hcrit` threshold. | Glendening (DrJack) |
| `function detectFluxSign(samples: readonly FluxSample[], radiationThresholdWm2?: number, minSamples?: number): FluxSignDetection` | Detects sign convention by correlating heat flux with shortwave radiation: | docs/OPEN_METEO_INTEGRATION.md §4.1 (measured conventions) |
| `function expectedVarioAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres, profile: AircraftProfile): MPerS` | Expected variometer reading at altitude: core updraft minus circling sink rate. | Glendening (DrJack): "subtract glider sink rate to obtain average |
| `function frictionVelocity(surfaceWindMs: MPerS, roughnessLengthM: Metres, windHeightM?: number): number` | Friction velocity from logarithmic wind profile law. | Logarithmic wind profile law |
| `function innerRadiusRatio(outerRadiusM: Metres): number` | Ratio between inner and outer radius of the inverted trapezoid thermal model. | Allen (2006) |
| `function meanClimbOverBand(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile, samples?: number): Result<MPerS>` | Mean climb rate seen on the vario throughout a full climb, from 10 % of the boundary layer up to the critical height. | Allen (2006) |
| `function netLongwaveUpWm2(tempK: Kelvin, dewpointK: Kelvin, cloudCoverFrac: number): number` | Net upward surface longwave radiation, FAO-56 parameterisation adapted with cloud cover fraction instead of clear-sky solar ratio. | Allen (1998) |
| `function normaliseUpwardFlux(fluxWm2: number, convention: FluxSignConvention): number \| null` | Normalises heat flux to internal convention: **positive upward**. | docs/OPEN_METEO_INTEGRATION.md §4.1 |
| `function reconcileMixingHeight(parcelAglM: Metres, modelAglM: Metres \| null, toleranceFrac?: number): MixingHeightResult` | — | Glendening (DrJack): "when mixing results from shear rather than |
| `function superadiabaticExcessK(sounding: Sounding, referenceAglM?: Metres): number` | Surface layer superadiabatic potential temperature excess. | Convective surface layer structure |
| `function surfaceHeatFlux(input: HeatFluxInput): HeatFluxResult` | Sensible heat flux, along with kinematic and virtual representations. | Allen (2006) |
| `function thermalIndexAt(sounding: Sounding, maxSurfaceTempK: Kelvin, mslM: Metres): Result<number>` | Thermal index at a specified altitude above mean sea level. | Classical thermal index method |
| `function thermalTop(sounding: Sounding, maxSurfaceTempK: Kelvin): Result<ThermalTopResult>` | Thermal ceiling via parcel method: altitude where a surface parcel lifted at maximum temperature ceases to be warmer than the environment. | Parcel method |
| `function triggerTemperature(sounding: Sounding): Result<TriggerResult>` | Trigger temperature and Convective Condensation Level (CCL). | Classical CCL and convective temperature method |
| `function updraftMeanAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS` | Mean updraft velocity across the thermal cross-section. | Allen (2006) |
| `function updraftOuterRadius(zAglM: Metres, ziAglM: Metres): Metres` | Thermal outer radius. | Allen (2006) |
| `function updraftPeakAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS` | Peak core updraft velocity derived from cross-sectional mean and inverted trapezoid geometry. | Allen (2006) |
| `function updraftProfile(wStarMs: MPerS, ziAglM: Metres, options?: ProfileOptions): readonly ProfilePoint[]` | Sampled vertical thermal profile for plotting and numerical searches. | Allen (2006) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `BROKEN_THRESHOLD` | `const BROKEN_THRESHOLD = 5` | DrJack's empirical thresholds. |
| `DAYTIME_RADIATION_THRESHOLD_WM2` | `const DAYTIME_RADIATION_THRESHOLD_WM2 = 200` | Radiation threshold above which the surface is considered heating up. |
| `DEFAULT_SURFACE_TYPE` | `const DEFAULT_SURFACE_TYPE: SurfaceType` | Default surface type when site metadata leaves it unspecified. |
| `GROUND_FLUX_FRACTION` | `const GROUND_FLUX_FRACTION = 0.1` | Fraction of net radiation entering the ground (Stull percentage method). |
| `MIN_OUTER_RADIUS_M` | `const MIN_OUTER_RADIUS_M = 10` | Minimum outer radius in metres (Allen eq. |
| `MIN_SAMPLES_FOR_DETECTION` | `const MIN_SAMPLES_FOR_DETECTION = 3` | Minimum daytime samples required for reliable detection. |
| `ORGANISED_THRESHOLD` | `const ORGANISED_THRESHOLD = 10` | — |
| `SHEAR_DRIVEN_DIVERGENCE_FRAC` | `const SHEAR_DRIVEN_DIVERGENCE_FRAC = 0.5` | Divergence threshold above which non-convective mixing is suspected. |
| `SURFACE_DEFAULTS` | `const SURFACE_DEFAULTS: Readonly<Record<SurfaceType, SurfaceDefaults>>` | — |
| `SURFACE_LAYER_TOP_AGL_M` | `const SURFACE_LAYER_TOP_AGL_M = 200` | Reference height for measuring superadiabatic surface layer excess. |
| `SURFACE_WIND_HEIGHT_M` | `const SURFACE_WIND_HEIGHT_M = 10` | Reference height for surface wind. |
| `VON_KARMAN` | `const VON_KARMAN = 0.4` | Von Kármán constant. |
| `WORKING_BAND_BOTTOM_FRAC` | `const WORKING_BAND_BOTTOM_FRAC = 0.1` | Relative height representing the bottom of the working band. |
| `WORKING_THERMAL_INDEX_K` | `const WORKING_THERMAL_INDEX_K = -2` | Working thermal index. |
| `ZERO_CROSSING_RATIO` | `const ZERO_CROSSING_RATIO: number` | Relative altitude where mean velocity drops to zero: 1/1.1. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `BuoyancyShearInput` | `interface BuoyancyShearInput — 4 fields` | — |
| `BuoyancyShearResult` | `interface BuoyancyShearResult — 4 fields` | — |
| `CriticalHeightResult` | `interface CriticalHeightResult — 3 fields` | — |
| `FluxSample` | `interface FluxSample — 2 fields` | — |
| `FluxSignConvention` | `type FluxSignConvention = "up_positive" \| "down_positive" \| "unknown"` | Sensible heat flux sign normalisation. |
| `FluxSignDetection` | `interface FluxSignDetection — 3 fields` | — |
| `HeatFluxInput` | `interface HeatFluxInput — 12 fields` | — |
| `HeatFluxResult` | `interface HeatFluxResult — 10 fields` | — |
| `HeatFluxSource` | `type HeatFluxSource = "model" \| "energy_balance"` | — |
| `MixingHeightResult` | `interface MixingHeightResult — 5 fields` | — |
| `ProfileOptions` | `interface ProfileOptions — 2 fields` | — |
| `ProfilePoint` | `interface ProfilePoint — 4 fields` | — |
| `SurfaceDefaults` | `interface SurfaceDefaults — 4 fields` | — |
| `ThermalQuality` | `type ThermalQuality = "broken" \| "tilted" \| "organised"` | — |
| `ThermalTopResult` | `interface ThermalTopResult — 7 fields` | — |
| `TriggerResult` | `interface TriggerResult — 4 fields` | — |
| `WStarInput` | `interface WStarInput — 5 fields` | — |
| `WStarResult` | `interface WStarResult — 2 fields` | — |


### `soarwx/clouds`

Cumulus base, depth, overdevelopment and usable ceiling.

The base is **not** the LCL of the instantaneous surface parcel: it is the
condensation level of the **mixed-layer parcel**, using the layer's mean mixing
ratio and the forecast maximum temperature. A thermometer 2 m above irrigated
grass does not describe the column that rises.

`usableCeiling` is the function that decides the number the pilot looks at, and
it **declares why**: `hcrit`, cloudbase, the thermal top, or overcast skies.
Without the reason, a low ceiling doesn't tell you whether the problem is the
cloud, the thermal, or the shading.

```ts
import { mixedLayerMean, cumulusBase, cumulusDepth, isBlueDay, usableCeiling, overdevelopmentRisk } from "soarwx/clouds";
import { m } from "soarwx/units";

// Mass-weighted averages of the mixed layer.
const ml = mixedLayerMean(sounding, m(2400));

// The base is the CCL of the mixed-layer parcel, not the 2 m LCL.
const base = cumulusBase(sounding, m(2400), maxSurfaceTempK, m(2777));
const cloudBaseAglM = base.ok && base.value.sufficientMoisture ? base.value.baseAglM : null;

const ceiling = usableCeiling({
  hcritAglM: m(2364),
  thermalTopAglM: m(2777),
  cloudBaseAglM,
  overcast: false,
  elevationMslM: m(1013),
});
ceiling.aglM;        // 2364
ceiling.limitedBy;   // "hcrit" — the reason always comes with the number

// Blue day: the layer ends before the parcel condenses.
cloudBaseAglM === null || isBlueDay(cloudBaseAglM, m(2777));

// Overdevelopment as an ordinal scale, with the drivers that push it up.
const od = overdevelopmentRisk({
  cumulusDepthM: m(1200),
  midLevelHumidityFrac: 0.55,
  capeBand: "moderate",
  convectiveInhibitionJkg: 20,
  cloudCoverMidFrac: 0.3,
});
od.level;     // "none" | "low" | "moderate" | "high" | "severe"
od.drivers;   // ["depth", "midlevel_moisture", ...] — what's pushing it up
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function cumulusBase(sounding: Sounding, mixingHeightAglM: Metres, maxSurfaceTempK: Kelvin, thermalTopAglM?: Metres): Result<CloudBaseResult>` | Cumulus cloudbase via condensation level of mixed-layer parcel. | Bolton (1980) |
| `function cumulusDepth(cloudBaseAglM: Metres, thermalTopAglM: Metres): Metres` | Cumulus cloud vertical depth: extent of convective cloud development above cloudbase. | Standard convective development indicator |
| `function isBlueDay(cloudBaseAglM: Metres, thermalTopAglM: Metres): boolean` | Blue thermal day: convective condensation level sits above thermal ceiling, so convective thermals do not trigger cloud formation. | Standard soaring operational definition |
| `function mixedLayerMean(sounding: Sounding, topAglM: Metres): Result<MixedLayerResult>` | Mass-weighted averages (weighted by layer pressure depth) from surface up to mixed layer top. | Mixed-layer parcel definition |
| `function overdevelopmentRisk(input: OverdevelopmentInput): OverdevelopmentResult` | — | Classic convective development indicators |
| `function usableCeiling(input: CeilingInput): CeilingResult` | Computes usable ceiling: minimum of critical climb height (hcrit), thermal ceiling, and cumulus cloudbase, declaring the active limiting factor. | Glendening (DrJack) criteria: `hcrit` as operational ceiling and cloudbase as hard upper bound |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DEPTH_THRESHOLDS_M` | `const DEPTH_THRESHOLDS_M: readonly [1000, 2000, 3000]` | Cumulus vertical depth thresholds in metres triggering elevated risk. |
| `WEAK_INHIBITION_JKG` | `const WEAK_INHIBITION_JKG = 25` | Convective inhibition (CIN) threshold in J/kg below which development is uninhibited. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `CeilingInput` | `interface CeilingInput — 5 fields` | — |
| `CeilingLimit` | `type CeilingLimit = "cloudbase" \| "hcrit" \| "boundary_layer" \| "overcast" \| "no_convection"` | — |
| `CeilingResult` | `interface CeilingResult — 3 fields` | — |
| `CloudBaseResult` | `interface CloudBaseResult — 5 fields` | — |
| `MixedLayerResult` | `interface MixedLayerResult — 4 fields` | — |
| `OverdevelopmentDriver` | `type OverdevelopmentDriver = "depth" \| "midlevel_moisture" \| "cape" \| "low_inhibition" \| "cloud_cover"` | — |
| `OverdevelopmentInput` | `interface OverdevelopmentInput — 5 fields` | — |
| `OverdevelopmentLevel` | `type OverdevelopmentLevel = "none" \| "low" \| "moderate" \| "high" \| "severe"` | — |
| `OverdevelopmentResult` | `interface OverdevelopmentResult — 3 fields` | — |


### `soarwx/stability`

Stability indices, all derived from the **same** sounding and the same model.

**CAPE is risk, never merit.** It does not appear in `FactorId`, only in `VetoId`.
Scoring it as good while simultaneously vetoing it — the predecessor gave top marks
at 2400 J/kg while being 100 J/kg away from triggering its own veto — is the
contradiction this library exists to fix.

The **Lifted Index describes the atmosphere above the boundary layer**, not inside
it. A 3000 m mixed layer with LI +1.6 is an excellent day. Since 0.8.0 the
stability veto additionally requires the ceiling to be low.

```ts
import { liftedIndex, liftedIndexBand, kIndex, totalTotals, capeRisk } from "soarwx/stability";

const li = liftedIndex(sounding, maxSurfaceTempK);
if (li.ok) liftedIndexBand(li.value);      // "stable" | "marginally_unstable" | ...
// li.error.code === "MISSING_VARIABLE" when the 500 hPa level is missing.
// Never returns 0.0 for absent data: a real 0.0 and absent are distinguishable.

const risk = capeRisk(2800, 15);   // (CAPE, CIN) — both can be null
risk.band;            // "moderate"
risk.stormPotential;  // feeds the vetoes, never the factors
risk.inhibited;       // enough CIN to cap deep convection
risk.capeJkg;         // null if the model didn't serve it
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function capeRisk(capeJkg: number \| null, convectiveInhibitionJkg?: number \| null): CapeRisk` | Classifies CAPE as **convective risk**, taking capping inhibition into account. | Glendening (DrJack) |
| `function kIndex(sounding: Sounding): Result<number>` | George's K-Index. | George (1960) |
| `function liftedIndex(sounding: Sounding, surfaceTempK?: Kelvin): Result<number>` | Surface parcel Lifted Index. | Galway (1956) |
| `function liftedIndexBand(li: number): LiftedIndexBand` | Ordinal classification of Lifted Index. | Galway (1956) |
| `function totalTotals(sounding: Sounding): Result<number>` | Total Totals Index. | Miller (1972) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CAPE_BANDS_JKG` | `const CAPE_BANDS_JKG: { readonly weak: 300; readonly moderate: 1000; readonly strong: 2500; readonly extreme: 5300; }` | CAPE classification bands and associated thunderstorm potential. |
| `INHIBITING_CIN_JKG` | `const INHIBITING_CIN_JKG = 50` | Convective inhibition threshold considered sufficient to cap deep convection. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `CapeBand` | `type CapeBand = "none" \| "weak" \| "moderate" \| "strong" \| "extreme"` | CAPE as risk, never as virtue. |
| `CapeRisk` | `interface CapeRisk — 5 fields` | — |
| `LiftedIndexBand` | `type LiftedIndexBand = "stable" \| "marginally_unstable" \| "moderately_unstable" \| "very_unstable" \| "extremely_unstable"` | Ordinal bands for Lifted Index deep convection diagnosis. |


### `soarwx/orographic`

Ridge lift and wave, **from the real geometry of the ridge**, not from
hand-written bearing sectors.

The predecessor had a hard-coded 310° for "the Guadarrama". The actual normal of
La Mujer Muerta is 338°: 28° of error, costing cos 28° = 0.887 of the
perpendicular component. Here the ridge enters as `RidgeSpec` and the consumer
supplies it.

Wave is judged by the **Scorer parameter** (`l² = N²/U² − U″/U`) computed from
the sounding. The sector-and-threshold heuristic exists as a fallback, and when
it is used it is declared in `method`.

```ts
import { ridgeLift, scorerParameter, wavePotential } from "soarwx/orographic";
import { deg, m, mps } from "soarwx/units";

const mujerMuerta = { name: "La Mujer Muerta", bearingDeg: deg(68), slopeDeg: deg(16), crestMslM: m(2197) };

const lift = ridgeLift(mujerMuerta, { speedMs: mps(9), fromDeg: deg(340) });
lift.perpendicularMs;  // wind component perpendicular to the ridge
lift.verticalMs;       // U_perp * sin(slope)
lift.incidenceDeg;     // 0 = head-on
lift.band;             // "insufficient" | "marginal" | "optimal" | "dangerous"

const wave = wavePotential(sounding, mujerMuerta);
if (wave.ok) {
  wave.value.potential;         // "none" | "marginal" | "likely" | "strong"
  wave.value.method;            // "scorer" or "heuristic": never hidden
  wave.value.trappedLeeWave;
  wave.value.estimatedWavelengthM;
}
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function ridgeLift(ridge: RidgeSpec, windAtCrest: WindVector): RidgeLiftResult` | Computes orographic ridge lift from wind at crest altitude. | Forced airflow over topography |
| `function scorerParameter(sounding: Sounding, flowTowardDeg: number): Result<readonly ScorerPoint[]>` | Computes Scorer parameter profile along the direction of airflow. | Scorer (1949) |
| `function wavePotential(sounding: Sounding, ridge: RidgeSpec): Result<WaveResult>` | Evaluates lee wave potential downwind of a mountain ridge. | Scorer (1949) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `LOWER_LAYER_DEPTH_M` | `const LOWER_LAYER_DEPTH_M = 1500` | Lower layer depth above crest used for Scorer parameter comparison. |
| `MIN_ALONG_FLOW_MS` | `const MIN_ALONG_FLOW_MS = 2` | Minimum along-flow wind speed threshold required for meaningful Scorer calculation. |
| `MIN_CROSS_RIDGE_MS` | `const MIN_CROSS_RIDGE_MS = 7.5` | Minimum cross-ridge perpendicular wind speed threshold (approx 15 kt). |
| `RIDGE_LIFT_THRESHOLDS_MS` | `const RIDGE_LIFT_THRESHOLDS_MS: { readonly marginal: 4.1; readonly optimal: 7.7; readonly dangerous: 14.4; }` | Perpendicular wind speed thresholds in m/s (approx 8, 15, and 28 kt). |
| `STRONG_WAVE_DROP_FACTOR` | `const STRONG_WAVE_DROP_FACTOR = 2` | Multiplier on Scorer trapping threshold required for strong wave rating. |
| `UPPER_LAYER_TOP_M` | `const UPPER_LAYER_TOP_M = 4000` | Top altitude of upper layer used for Scorer parameter comparison. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `RidgeLiftBand` | `type RidgeLiftBand = "insufficient" \| "marginal" \| "optimal" \| "dangerous"` | — |
| `RidgeLiftResult` | `interface RidgeLiftResult — 4 fields` | — |
| `ScorerPoint` | `interface ScorerPoint — 6 fields` | — |
| `WaveMethod` | `type WaveMethod = "scorer" \| "heuristic"` | — |
| `WavePotential` | `type WavePotential = "none" \| "marginal" \| "likely" \| "strong"` | — |
| `WaveResult` | `interface WaveResult — 6 fields` | — |


### `soarwx/aircraft`

The aircraft profile, which carries two distinct numbers worth keeping apart.

`hcritThresholdMs` is the **criterion**: DrJack's 225 fpm (1.143 m/s) at which
the thermal stops being usable. It is the same across the entire catalogue,
because it is a RASP convention and not an aircraft property. Switching profiles
**does not move `hcrit`**, and that is deliberate: it is what keeps the ceiling
comparable with what RASP publishes.

`circlingSinkMs` is the **actual sink rate** circling at 40°, and it does depend
on the model. It is not declared by hand: it comes from the manufacturer's
minimum straight-flight sink multiplied by `BANK_40_SINK_FACTOR`. In coordinated
turns the load factor is `n = 1/cos φ`, and for a parabolic polar flying at the
optimal speed for the new load factor, speed goes up by `n^(1/2)` and sink by
`n^(3/2)`. At 40° that is +14 % and +49 %. An ASK 21 goes from 0.65 to 0.97 m/s:
below the 225 fpm threshold that was the warning.

`RASP_REFERENCE` sets both fields equal and reproduces exactly what RASP publishes,
for cross-checking.

The wind cutoff, 12.87 m/s, is common to all profiles: it acts on `w*`, so it is
meteorology, not aircraft. That 12.87 is the number Allen uses in his calculations
even though his text says "25 knots"; the exact 25 knots are separate, in
`ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS`, and the difference is noted rather than hidden.

A note on the model table: each manufacturer publishes minimum sink at the mass
that suits them, so the figures are not strictly comparable. The Astir CS manual
shows it in a single table: 0.6 m/s at 350 kg and 0.7 m/s at 450 kg.

```ts
import { GLIDER_CLUB, ASH_25, RASP_REFERENCE, AIRCRAFT_PROFILES, findAircraftProfile } from "soarwx/aircraft";
import { criticalHeight, expectedVarioAt } from "soarwx/convection";

// The ceiling does not depend on the glider: the 225 fpm criterion fixes it.
criticalHeight(wStarMs, ziAglM, GLIDER_CLUB);       // 2364 m AGL
criticalHeight(wStarMs, ziAglM, ASH_25);            // the same 2364 m AGL

// What does depend on the glider is what the vario shows.
expectedVarioAt(wStarMs, ziAglM, ziAglM, ASH_25);   // more than with GLIDER_CLUB

// With RASP's reference, the vario drops to zero right at hcrit.
RASP_REFERENCE.circlingSinkMs === RASP_REFERENCE.hcritThresholdMs;

findAircraftProfile("duo-discus");                  // one from the catalogue
AIRCRAFT_PROFILES.length;                           // 12
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function circlingSinkFactor(bankDeg: number): number` | Factor by which minimum sink increases when banking compared to straight flight. | Classical glider turning mechanics |
| `function findAircraftProfile(id: string): AircraftProfile \| undefined` | Looks up a profile by identifier. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `AIRCRAFT_PROFILES` | `const AIRCRAFT_PROFILES: readonly AircraftProfile[]` | Complete catalogue in display order. |
| `ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS` | `const ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS: MPerS` | Exact 25 knots, for callers preferring knot-rounded cutoffs. |
| `ASH_25` | `const ASH_25: AircraftProfile` | Schleicher ASH 25. |
| `ASK_21` | `const ASK_21: AircraftProfile` | Schleicher ASK 21. |
| `ASTIR_CS` | `const ASTIR_CS: AircraftProfile` | Grob Astir CS. |
| `BANK_40_SINK_FACTOR` | `const BANK_40_SINK_FACTOR: number` | Factor at `REFERENCE_BANK_DEG`. |
| `DG_1001_CLUB` | `const DG_1001_CLUB: AircraftProfile` | DG-1001 Club. |
| `DUO_DISCUS` | `const DUO_DISCUS: AircraftProfile` | Schempp-Hirth Duo Discus. |
| `G103A_TWIN_II` | `const G103A_TWIN_II: AircraftProfile` | Grob G103A Twin II Acro. |
| `GLIDER_CLUB` | `const GLIDER_CLUB: AircraftProfile` | Club glider. |
| `GLIDER_PERFORMANCE` | `const GLIDER_PERFORMANCE: AircraftProfile` | Modern 15m to 18m single-seater. |
| `GLIDER_TRAINER` | `const GLIDER_TRAINER: AircraftProfile` | Two-seater trainer at double occupancy, or club glider with buggy wings. |
| `LS8E_15` | `const LS8E_15: AircraftProfile` | LS8-e neo, 15 m. |
| `LS8E_18` | `const LS8E_18: AircraftProfile` | LS8-e neo, 18 m. |
| `RASP_HCRIT_THRESHOLD_MS` | `const RASP_HCRIT_THRESHOLD_MS: MPerS` | `hcrit` threshold. |
| `RASP_REFERENCE` | `const RASP_REFERENCE: AircraftProfile` | DrJack's baseline criterion, modeled as an aircraft profile. |
| `REFERENCE_BANK_DEG` | `const REFERENCE_BANK_DEG = 40` | Reference bank angle for thermalling. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `AircraftProfile` | `interface AircraftProfile — 7 fields` | — |
| `AircraftProfileId` | `type AircraftProfileId = …` | Catalogue identifiers. |


### `soarwx/forecast`

How numbers become a verdict, with the breakdown in plain sight.

**Factors score by bands** and each one returns its value, its score, its weight
and whether it passes. **Vetoes cap, they don't subtract**: an overcast sky
doesn't take off half a point — it prevents going above level 1 no matter how
well everything else scores. And **no factor rewards what a veto penalises**,
which is the rule that keeps CAPE out.

The best hour is ranked by usable ceiling and level after vetoes, never by how
many factors came out green.

```ts
import { evaluateVetoes, aggregate, findWindows, bestHour, confidenceFrom, DEFAULT_FACTORS, buildFactor } from "soarwx/forecast";
import { capeRisk } from "soarwx/stability";
import { m, mps } from "soarwx/units";

const factors = [
  buildFactor("climb_strength", 1.9, DEFAULT_FACTORS.climb_strength),
  buildFactor("usable_ceiling", 2364, DEFAULT_FACTORS.usable_ceiling),
];

const vetoes = evaluateVetoes({
  hasConvection: true,
  overcast: false,
  usableCeilingAglM: m(2364),
  liftedIndex: 1.5,          // positive, but the layer has depth: does NOT veto
  cape: capeRisk(800),
  kIndex: 18,
  surfaceWindMs: 4,
});

const score = aggregate(factors, vetoes);
score.level;              // 1..5 after applying the caps
score.levelBeforeVetoes;  // the level it would have scored without them
score.factors;            // each with value, score, weight and band
score.limitingFactors;    // those scoring below 0.6, worst first

// Windows of at least two consecutive hours above level 3:
const windows = findWindows(hours, 3);

// Confidence as spread between models, not as a made-up number:
const confidence = confidenceFrom([
  { model: "icon_eu", ceilingAglM: m(2364), wStarMs: mps(3.28) },
  { model: "gfs_seamless", ceilingAglM: m(2537), wStarMs: mps(3.11) },
]);
confidence?.level;             // "low" | "medium" | "high"
confidence?.ceilingSpreadM;    // 173
confidence?.modelsUsed;        // null altogether if only one model was available
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function aggregate(factors: readonly Factor[], vetoes: readonly Veto[], thresholds?: readonly [number, number, number, number]): SoaringScore` | Computes soaring index from individual factor scores and veto conditions. | Requirements R-10.1 through R-10.5 from docs/REQUIREMENTS.md |
| `function bestHour<T extends ScoredHour>(hours: readonly T[]): T \| null` | Determines the best soaring hour of the day. | Requirement R-11.3 from docs/REQUIREMENTS.md |
| `function buildFactor(id: FactorId, value: number, spec: FactorSpec): Factor` | Builds a scoring factor from its raw value and specification. | Requirement R-10.2 from docs/REQUIREMENTS.md |
| `function confidenceFrom(samples: readonly ModelSample[]): Confidence \| null` | Computes forecast confidence from multi-model spread. | Requirements R-12.1 through R-12.3 from docs/REQUIREMENTS.md |
| `function evaluateVetoes(input: VetoInput): readonly Veto[]` | Evaluates applicable vetoes for a forecast hour. | Requirements R-10.3 |
| `function findWindows(hours: readonly ScoredHour[], minLevel: SoaringLevel, minWindowHours?: number): readonly SoaringWindow[]` | Identifies contiguous windows of hours that achieve at least `minLevel`. | Requirement R-11.2 from docs/REQUIREMENTS.md |
| `function resolveScoring(config?: ScoringConfig): ResolvedScoring` | Merges consumer overrides with default scoring configuration. | Requirement R-10.4 from docs/REQUIREMENTS.md |
| `function scoreBand(value: number, band: Band): number` | Evaluates parameter score within specified band, normalized to [0, 1]. |  |
| `function vetoCap(vetoes: readonly Veto[]): 1 \| 2 \| 3 \| 4 \| 5` | Maximum soaring rating permitted across all active vetoes. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CAPPED_CEILING_AGL_M` | `const CAPPED_CEILING_AGL_M = 1500` | Usable ceiling threshold below which upper-air atmospheric stability limits soaring. |
| `CEILING_SPREAD_THRESHOLDS_M` | `const CEILING_SPREAD_THRESHOLDS_M: { readonly high: 300; readonly medium: 800; }` | Ceiling spread thresholds in metres separating confidence tiers. |
| `DEFAULT_FACTORS` | `const DEFAULT_FACTORS: Readonly<Record<FactorId, FactorSpec>>` | Default soaring scoring factor configuration calibrated for gliders. |
| `DEFAULT_LEVEL_THRESHOLDS` | `const DEFAULT_LEVEL_THRESHOLDS: readonly [number, number, number, number]` | Default aggregated score thresholds separating the 5 soaring rating levels. |
| `FACTOR_OK_THRESHOLD` | `const FACTOR_OK_THRESHOLD = 0.6` | Minimum factor score threshold for `ok` status. |
| `MIN_WINDOW_HOURS` | `const MIN_WINDOW_HOURS = 2` | Minimum consecutive hours required to establish a soaring window. |
| `SEVERE_CAPE_JKG` | `const SEVERE_CAPE_JKG = 3500` | CAPE threshold above which severe storm veto triggers, in J/kg. |
| `STORM_K_INDEX` | `const STORM_K_INDEX = 25` | K-Index threshold above which elevated CAPE is considered stormy. |
| `STRONG_WIND_MS` | `const STRONG_WIND_MS = 12.87` | Surface wind speed threshold triggering strong wind veto, in m/s (25 kt). |
| `STRONGLY_STABLE_LI` | `const STRONGLY_STABLE_LI = 2` | Lifted Index threshold above which upper stability is pronounced. |
| `UNUSABLE_CEILING_AGL_M` | `const UNUSABLE_CEILING_AGL_M = 800` | Usable ceiling threshold below which soaring is not viable. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Band` | `interface Band — 4 fields` | Piecewise-linear scoring band interpolation. |
| `Confidence` | `interface Confidence — 4 fields` | — |
| `ConfidenceLevel` | `type ConfidenceLevel = "low" \| "medium" \| "high"` | — |
| `Factor` | `interface Factor — 7 fields` | — |
| `FactorId` | `type FactorId = "climb_strength" \| "usable_ceiling" \| "lapse_rate" \| "thermal_quality" \| "surface_wind" \| "moisture" \| "cloud_cover"` | — |
| `FactorSpec` | `interface FactorSpec — 4 fields` | — |
| `ModelSample` | `interface ModelSample — 3 fields` | — |
| `ResolvedScoring` | `interface ResolvedScoring — 2 fields` | — |
| `ScoredHour` | `interface ScoredHour — 4 fields` | Minimum required fields for an hourly forecast evaluation. |
| `ScoringConfig` | `interface ScoringConfig — 3 fields` | — |
| `SoaringLevel` | `type SoaringLevel = 1 \| 2 \| 3 \| 4 \| 5` | — |
| `SoaringScore` | `interface SoaringScore — 6 fields` | — |
| `SoaringWindow` | `interface SoaringWindow — 5 fields` | — |
| `Veto` | `interface Veto — 3 fields` | — |
| `VetoId` | `type VetoId = "no_convection" \| "overcast" \| "ceiling_too_low" \| "stable_atmosphere" \| "cape_severe" \| "cape_with_storm_index" \| "wind_too_strong"` | — |
| `VetoInput` | `interface VetoInput — 7 fields` | — |
| `VetoLevel` | `type VetoLevel = 1 \| 2 \| 3` | — |


### `soarwx/report`

`computeDay` is the library's seam: **everything above it is tested with no
network and no clock**. It takes hourly observations already in SI and returns
the full day — scored hours, windows, best moment, attribution.

It is pure and deterministic. The same input yields the same output byte for
byte, and there is a test that runs it a hundred times to verify.

Each `SoaringHour` carries its `sounding` inside, so the consumer can draw the
skew-T for that hour without making another request.

```ts
import { computeDay } from "soarwx/report";
import { GLIDER_CLUB } from "soarwx/aircraft";
import type { SoaringDay, SoaringHour } from "soarwx/report";

const result = computeDay({
  site,
  hourly,                       // HourlyObservation[]
  dateLocal: "2026-08-19",
  sunriseUtc: "2026-08-19T05:31",
  sunsetUtc: "2026-08-19T19:09",
  profile: GLIDER_CLUB,         // optional
});
if (!result.ok) throw new Error(result.error.code);

const day: SoaringDay = result.value;
day.best;            // SoaringHour | null — null is a day with no window, not a failure
day.windows;         // continuous flyable spans
day.attribution;     // must be displayed: Open-Meteo is CC BY 4.0
day.confidence;      // null with a single model, not a made-up value

for (const hour of day.hours as readonly SoaringHour[]) {
  hour.thermal.wStarMs;
  hour.thermal.meanClimbMs;
  hour.ceiling.aglM;
  hour.ceiling.limitedBy;
  hour.cloud.blue;
  hour.quality.heatFluxSource;      // "model" or "energy_balance"
  hour.quality.pressureLevelsUsed;  // how many levels survived the pruning
}
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function computeDay(input: ComputeDayInput): Result<SoaringDay>` | Computes daily soaring report across all daylight hours without network access. | docs/SPEC.md §12 |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `BROKEN_COVER_FRAC` | `const BROKEN_COVER_FRAC = 0.625` | Cloud cover fraction threshold for broken (BKN) sky conditions. |
| `LOW_MID_CUTOFF_MSL_M` | `const LOW_MID_CUTOFF_MSL_M = 3000` | Altitude threshold (m MSL) separating low cloud cover from mid-level cloud cover. |
| `OVERCAST_COVER_FRAC` | `const OVERCAST_COVER_FRAC = 0.875` | Total cloud cover fraction threshold for overcast (OVC) sky conditions. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `ComputeDayInput` | `interface ComputeDayInput — 8 fields` | — |
| `HourCloud` | `interface HourCloud — 5 fields` | — |
| `HourlyObservation` | `interface HourlyObservation — 10 fields` | An hourly input observation normalized to SI units. |
| `HourQuality` | `interface HourQuality extends SoundingQuality — 2 fields` | — |
| `HourStability` | `interface HourStability — 5 fields` | — |
| `HourThermal` | `interface HourThermal — 12 fields` | — |
| `HourWind` | `interface HourWind — 6 fields` | — |
| `LiftedIndexSource` | `type LiftedIndexSource = "model" \| "computed" \| "unavailable"` | — |
| `SoaringDay` | `interface SoaringDay — 9 fields` | — |
| `SoaringHour` | `interface SoaringHour — 9 fields` | — |


### `soarwx/openmeteo`

**The only module that makes HTTP requests.** Everything else is pure.

`fetch` is injectable: tests serve fixtures and the same code runs in the browser
and in Node. The request goes via POST with repeated fields, because with eight
pressure levels the GET URL is too long and joining the variables by commas in
POST returns 400.

Traps this module encapsulates, all verified against the live API and not read
from the documentation:

- **An unknown variable name returns 400 and kills the entire request**, not just
  that variable. A known variable the model doesn't have returns an array of
  `null` with no error. Detected by content, never by key presence.
- **`hourly_units` can arrive with the literal string `"undefined"`.**
- **`models=best_match` stitches different models** along the horizon: the series
  stops being physically coherent and the multi-model spread stops meaning
  anything. It is forbidden.
- `elevation`, the site's timezone and `wind_speed_unit=ms` are always sent.

```ts
import { fetchSoaringDay, memoryCache, MODEL_CAPABILITIES, soundingModels } from "soarwx/openmeteo";
import { GLIDER_CLUB } from "soarwx/aircraft";

// Multiple models + spread-based confidence, in one call:
const result = await fetchSoaringDay(site, "2026-08-19", {
  models: ["icon_eu", "gfs_seamless"],
  profile: GLIDER_CLUB,
  timeoutMs: 8000,
  retries: 2,
  cache: memoryCache(),
});
if (result.ok) {
  result.value.day;       // SoaringDay, already computed
  result.value.failed;    // models that didn't respond: partial failure, not total
}

// In tests, no network: inject the fetch.
await fetchSoaringDay(site, "2026-08-19", {
  fetch: async () => new Response(JSON.stringify(fixture), { status: 200 }),
});

// What each model serves, verified live and not copied from the docs:
MODEL_CAPABILITIES.icon_eu.hasBoundaryLayerHeight;   // false — ICON doesn't serve it
MODEL_CAPABILITIES.icon_eu.hasLiftedIndex;           // false — computed from the sounding
MODEL_CAPABILITIES.icon_eu.pressureLevelsHpa;        // the ones that actually exist
soundingModels();                                    // models that serve vertical profiles
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function buildForecastRequest(site: Site, options: ForecastRequestOptions): HttpRequest` | Constructs an HTTP request for Open-Meteo forecast API. | Requirements R-13.3 through R-13.5 from docs/REQUIREMENTS.md |
| `function cacheKey(url: string, body: URLSearchParams): string` | Computes stable cache key from endpoint URL and query payload. |  |
| `function centredRadiationWm2(response: OpenMeteoResponse, index: number): number` | Returns centered shortwave radiation value (W/m²). | §4.7 of docs/OPEN_METEO_INTEGRATION.md |
| `function fetchForecast(site: Site, options: ForecastRequestOptions, clientOptions?: OpenMeteoOptions): Promise<Result<{ response: OpenMeteoResponse; request: HttpRequest; }>>` | Fetches model forecast and validates request echo and returned units. |  |
| `function fetchSoaringDay(site: Site, dateLocal: string, options?: SoaringDayOptions): Promise<Result<MultiModelResult>>` | Fetches and computes soaring day forecast for site and date across ensemble models. | docs/OPEN_METEO_INTEGRATION.md §6.1 and §6.4 |
| `function hasData(response: OpenMeteoResponse, key: string): boolean` | Checks whether a variable contains non-null values. | §4.8 of docs/OPEN_METEO_INTEGRATION.md |
| `function levelsForSite(site: Site, available: readonly number[], marginM?: number): readonly number[]` | Identifies pressure levels above ground elevation for a site. | Requirement R-1.2 and §5.2 of docs/OPEN_METEO_INTEGRATION.md |
| `function levelVariableNames(levelsHpa: readonly number[]): string[]` | Returns full variable names for the specified pressure levels. |  |
| `function memoryCache(now?: () => number): CacheAdapter` | In-memory cache adapter for Node.js environments and testing. |  |
| `function missingVariables(response: OpenMeteoResponse, requested: readonly string[]): readonly string[]` | Returns requested variable names that yielded entirely empty (all-null) series. |  |
| `function noopCache(): CacheAdapter` | No-op cache adapter. |  |
| `function normaliseForecast(response: OpenMeteoResponse, site: Site, requestedLevelsHpa: readonly number[]): Result<NormalisedForecast>` | Normalizes Open-Meteo response into hourly observations for `computeDay`. | docs/OPEN_METEO_INTEGRATION.md §6.1 |
| `function sendRequest(request: HttpRequest, options?: OpenMeteoOptions): Promise<Result<OpenMeteoResponse>>` | Dispatches an HTTP request with caching, exponential backoff, and jitter. | §6.4 of docs/OPEN_METEO_INTEGRATION.md |
| `function sessionCache(): CacheAdapter` | Browser `sessionStorage` cache adapter. |  |
| `function soundingModels(): readonly OpenMeteoModel[]` | Models usable for atmospheric sounding generation, sorted by preference rank. |  |
| `function standardAtmosphereHeightM(pressureHpa: number): number` | Computes geopotential altitude of a pressure level in the International Standard Atmosphere (ISA). | International Standard Atmosphere (ISA) tropospheric formula |
| `function usableLevels(response: OpenMeteoResponse, levelsHpa: readonly number[]): readonly number[]` | Filters requested pressure levels down to those containing valid geopotential data. |  |
| `function validateEcho(response: OpenMeteoResponse, site: Site): Result<OpenMeteoResponse>` | Verifies that response metadata matches requested site parameters. | Requirements R-13.3 and R-13.4 from docs/REQUIREMENTS.md |
| `function validateUnits(response: OpenMeteoResponse): Result<OpenMeteoResponse>` | Validates declared response units against expected SI/meteorological units. | §4.7 of docs/OPEN_METEO_INTEGRATION.md |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `ABSENT_UNIT` | `const ABSENT_UNIT = "undefined"` | Unit string returned by Open-Meteo when a variable is unsupported by the requested model. |
| `BELOW_GROUND_MARGIN_M` | `const BELOW_GROUND_MARGIN_M = 150` | Margin below site elevation (metres) below which pressure levels are pruned. |
| `COMMERCIAL_FORECAST_URL` | `const COMMERCIAL_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast"` | — |
| `DAILY_VARIABLES` | `const DAILY_VARIABLES: readonly ["sunrise", "sunset"]` | — |
| `DEFAULT_RETRIES` | `const DEFAULT_RETRIES = 2` | — |
| `DEFAULT_TIMEOUT_MS` | `const DEFAULT_TIMEOUT_MS = 10000` | — |
| `ELEVATION_ECHO_TOLERANCE_M` | `const ELEVATION_ECHO_TOLERANCE_M = 1` | Elevation echo tolerance in metres. |
| `EXPECTED_UNITS` | `const EXPECTED_UNITS: Readonly<Record<string, string>>` | Expected units per variable category. |
| `FORECAST_URL` | `const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"` | — |
| `HEIGHT_LEVELS_M` | `const HEIGHT_LEVELS_M: readonly [80, 120, 180]` | Height levels above ground (metres). |
| `MIN_LEVELS_FOR_SOUNDING` | `const MIN_LEVELS_FOR_SOUNDING = 4` | Minimum pressure levels required from a model to construct a valid atmospheric sounding. |
| `MODEL_CAPABILITIES` | `const MODEL_CAPABILITIES: Readonly<Record<OpenMeteoModel, ModelCapabilities>>` | Model capability catalog verified against live API responses. |
| `PRESSURE_LEVEL_VARIABLES` | `const PRESSURE_LEVEL_VARIABLES: readonly ["temperature", "dew_point", "wind_speed", "wind_direction", "geopotential_height", "cloud_cover"]` | Atmospheric variables requested at each isobaric pressure level. |
| `PRESSURE_LEVELS_HPA` | `const PRESSURE_LEVELS_HPA: readonly [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500]` | Standard pressure levels (hPa) requested for atmospheric soundings. |
| `RECOMMENDED_ENSEMBLE` | `const RECOMMENDED_ENSEMBLE: readonly OpenMeteoModel[]` | Recommended 3-model multi-agency ensemble for multi-model confidence analysis. |
| `RETRYABLE_STATUS` | `const RETRYABLE_STATUS: readonly [429, 500, 502, 503, 504]` | Retryable HTTP status codes. |
| `SURFACE_VARIABLES` | `const SURFACE_VARIABLES: readonly ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "surface_pressure", "pressure_msl", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "temperature_80m", "wind_speed_80m", "wind_direction_80m", "temperature_120m", "wind_speed_120m", "wind_direction_120m", "temperature_180m", "wind_speed_180m", "wind_direction_180m", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "shortwave_radiation", "sensible_heat_flux", "latent_heat_flux", "cape", "convective_inhibition", "lifted_index", "boundary_layer_height", "soil_moisture_0_to_1cm", "is_day"]` | Open-Meteo API variable catalog. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `CacheAdapter` | `interface CacheAdapter — 0 fields` | — |
| `Coverage` | `type Coverage = "global" \| "europe"` | — |
| `FetchLike` | `type FetchLike = …` | — |
| `ForecastRequestOptions` | `interface ForecastRequestOptions — 6 fields` | — |
| `HourlySeries` | `type HourlySeries = readonly (number \| null)[]` | Forma de la respuesta de Open-Meteo, tal como llega. |
| `HttpRequest` | `interface HttpRequest — 4 fields` | — |
| `ModelCapabilities` | `interface ModelCapabilities — 11 fields` | — |
| `ModelDay` | `interface ModelDay — 2 fields` | — |
| `MultiModelResult` | `interface MultiModelResult — 3 fields` | — |
| `NormalisedForecast` | `interface NormalisedForecast — 6 fields` | — |
| `OpenMeteoError` | `interface OpenMeteoError — 2 fields` | — |
| `OpenMeteoModel` | `type OpenMeteoModel = …` | Model capabilities verified against live Open-Meteo APIs. |
| `OpenMeteoOptions` | `interface OpenMeteoOptions — 8 fields` | — |
| `OpenMeteoResponse` | `interface OpenMeteoResponse — 8 fields` | — |
| `SoaringDayOptions` | `interface SoaringDayOptions extends OpenMeteoOptions — 2 fields` | — |
| `SurfaceVariable` | `type SurfaceVariable = (typeof SURFACE_VARIABLES)[number]` | — |


### `soarwx/render`

**SVG string** generators. Zero dependencies, zero framework, zero JavaScript
sent to the client. The consumer inserts the string wherever they like.

Colours come from CSS custom properties (`--chart-1..5`) with literal fallbacks,
so they work in light and dark mode without recomputing anything. Everything
carries `<title>` and `<desc>`, and inserted text is escaped.

The wind panel scaling picks the step **in the unit being labelled**: requesting
km/h and computing the step in m/s produces labels like 9, 18, 27.

```ts
import { renderSkewT, renderUpdraftProfile, renderDayTimeline } from "soarwx/render";
import { GLIDER_CLUB } from "soarwx/aircraft";
import { m } from "soarwx/units";

const best = day.best!;

// Skew-T with the parcel, the ceiling, and the wind panel on the right.
const skewt = renderSkewT(best.sounding, {
  parcelFromK: best.sounding.surface.tempK,
  ceilingMslM: m(site.elevationMslM + best.ceiling.aglM),
  windUnit: "kmh",
  // `exactOptionalPropertyTypes` is enabled: an absent option is omitted,
  // not passed as `undefined`.
  ...(best.cloud.baseAglM === null ? {} : { lclMslM: m(site.elevationMslM + best.cloud.baseAglM) }),
});

// Updraft vs. height: the core and what the vario would show.
const profile = renderUpdraftProfile(best.thermal.wStarMs, best.thermal.thermalTopAglM, GLIDER_CLUB, {
  marks: {
    hcritAglM: best.ceiling.aglM,
    ...(best.cloud.baseAglM === null ? {} : { cloudBaseAglM: best.cloud.baseAglM }),
  },
});

// Ceiling evolution throughout the day, with the window and the best moment.
const timeline = renderDayTimeline(day);

container.innerHTML = skewt;   // they're strings, not nodes
void [profile, timeline];
```

**Functions**

| Signature | What it does | Source |
|---|---|---|
| `function document(options: DocumentOptions, body: string): string` | Wraps SVG markup in responsive and accessible root document container. | Requirements R-14.4 and R-14.5 from docs/REQUIREMENTS.md |
| `function element(tag: string, attrs: Attrs, children?: string): string` | Constructs an XML element string with escaped attributes. |  |
| `function escapeText(value: string): string` | Escapes XML special characters in string values. |  |
| `function legend(entries: readonly LegendEntry[], x: number, y: number, fontSizePx: number, labelColour: string): string` | Single-line chart legend. |  |
| `function polygon(points: readonly (readonly [number, number])[], attrs: Attrs): string` | Constructs an SVG `<polygon>` element from projected 2D coordinate pairs. |  |
| `function polyline(points: readonly (readonly [number, number])[], attrs: Attrs): string` | Constructs an SVG `<polyline>` element from projected 2D coordinate pairs. |  |
| `function renderDayTimeline(day: SoaringDay, options?: TimelineOptions): string` | Renders daily soaring timeline visualization. | Requirement R-14.2 from docs/REQUIREMENTS.md |
| `function renderSkewT(sounding: Sounding, options?: SkewTOptions): string` | Renders a Skew-T log-P thermodynamic diagram from an atmospheric sounding. | Standard oblique thermodynamic chart |
| `function renderUpdraftProfile(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile, options?: UpdraftProfileOptions): string` | Renders vertical updraft profile for specified convective velocity scale (w*) and boundary layer depth. | Allen (2006) |
| `function resolvePalette(overrides?: Partial<Palette>): Palette` | Merges user-defined palette overrides onto the default color palette. |  |
| `function round(value: number, decimals?: number): string` | Rounds numerical values to minimize floating point noise in SVG output. |  |
| `function text(content: string, attrs: Attrs): string` | Constructs an SVG `<text>` element with escaped text content. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DEFAULT_PALETTE` | `const DEFAULT_PALETTE: Palette` | Default color palette utilizing theme-aware CSS custom properties with fallbacks. |
| `LEVEL_OPACITY` | `const LEVEL_OPACITY: Readonly<Record<1 \| 2 \| 3 \| 4 \| 5, number>>` | Score level bar opacity mapping. |
| `MIN_FONT_SIZE_PX` | `const MIN_FONT_SIZE_PX = 10` | Minimum font size in pixels to ensure legibility across viewports. |
| `WIND_SHADE_THRESHOLDS_MS` | `const WIND_SHADE_THRESHOLDS_MS: { readonly brisk: 8.33; readonly cutoff: 12.87; }` | Wind speed shading thresholds in m/s. |
| `WINDOW_FILL_OPACITY` | `const WINDOW_FILL_OPACITY = 0.22` | Soaring window background fill opacity. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Attrs` | `type Attrs = Readonly<Record<string, string \| number \| undefined>>` | SVG rendering primitives. |
| `DocumentOptions` | `interface DocumentOptions — 5 fields` | — |
| `HeightReference` | `type HeightReference = "agl" \| "msl"` | Altitude reference for isobaric pressure level labels. |
| `LegendEntry` | `interface LegendEntry — 3 fields` | — |
| `Palette` | `type Palette = Readonly<Record<PaletteKey, string>>` | — |
| `PaletteKey` | `type PaletteKey = …` | Palette configuration. |
| `ProfileMarks` | `interface ProfileMarks — 3 fields` | — |
| `RenderOptions` | `interface RenderOptions — 6 fields` | — |
| `SkewTOptions` | `interface SkewTOptions extends RenderOptions — 10 fields` | — |
| `TimelineOptions` | `interface TimelineOptions extends RenderOptions — 3 fields` | — |
| `UpdraftProfileOptions` | `interface UpdraftProfileOptions extends RenderOptions — 2 fields` | — |
| `WindUnit` | `type WindUnit = "kmh" \| "kt" \| "ms"` | — |


### `soarwx/i18n/es`

The Spanish localization module. The core returns enums and numbers; this is where
they are translated into Spanish for pilots. No physics function imports this module,
and a test walks `src/` to enforce that.

The predecessor returned Rich markup inside values — `"[green]Bajo[/green]"` —
and then needed a function to strip it. That is why the verdict carries no text.

`formatHour` and `formatInstant` use the site's timezone, not the browser's:
a user in Berlin looking at Fuentemilanos needs to see the airfield's local time.

All `describe*` functions have the same shape — enum in, string out — and they are
exhaustive: a test walks every enum in the contract and requires a translation for
each value, so none can be left without text when a new one is added.

```ts
import * as es from "soarwx/i18n/es";

es.describeLevel(4);                       // the level, in words
es.describeCeilingLimit("hcrit");          // why the ceiling is what it is
es.describeVeto("stable_atmosphere");      // "Atmósfera estable sobre una capa convectiva corta"
es.describeThermalQuality("organised");
es.describeConfidence("medium");

es.formatHour("2026-08-19T14:00", site.timezone);      // "16:00" in summer
es.formatInstant("2026-08-19T14:00", site.timezone);   // with day and month

es.DISCLAIMER;   // does not replace an official briefing or the pilot's judgment
```

**Functions**

| Signature | What it does |
|---|---|
| `const describeCapeBand: (band: CapeBand) => string` | — |
| `const describeCeilingLimit: (limit: CeilingLimit) => string` | — |
| `const describeConfidence: (level: ConfidenceLevel) => string` | — |
| `const describeFactor: (id: FactorId) => string` | — |
| `const describeHeatFluxSource: (source: HeatFluxSource) => string` | — |
| `const describeLayer: (kind: StableLayerKind) => string` | — |
| `const describeLevel: (level: SoaringLevel) => string` | — |
| `const describeLiftedIndex: (band: LiftedIndexBand) => string` | — |
| `const describeLiftedIndexSource: (source: LiftedIndexSource) => string` | — |
| `const describeOverdevelopment: (l: OverdevelopmentLevel) => string` | — |
| `const describeRidgeLift: (band: RidgeLiftBand) => string` | — |
| `const describeThermalQuality: (q: ThermalQuality) => string` | — |
| `const describeVeto: (id: VetoId) => string` | — |
| `const describeWave: (potential: WavePotential) => string` | — |
| `const describeWaveMethod: (method: WaveMethod) => string` | — |
| `function formatHour(iso: string, timezone: string): string` | Solo la hora local, para rótulos compactos. |
| `function formatInstant(iso: string, timezone: string): string` | Fecha y hora en la zona del emplazamiento, en formato español. |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DISCLAIMER` | `const DISCLAIMER = "Previsi\u00F3n orientativa. No sustituye al briefing meteorol\u00F3gico oficial ni a la decisi\u00F3n del piloto al mando."` | Aviso que el consumidor debe mostrar junto a cualquier previsión. |


### `soarwx/i18n/en`

The English localization module. Turns numbers and enums from the core into natural
English for pilots.

Uses glider pilot terminology rather than meteorologist jargon. Date formatting
uses the site's timezone with standard British English conventions (en-GB, 24h clock).

```ts
import * as en from "soarwx/i18n/en";

en.describeLevel(4);                       // "Good"
en.describeCeilingLimit("hcrit");          // "limited by thermal strength"
en.describeVeto("stable_atmosphere");      // "Stable atmosphere above a shallow convective layer"
en.describeThermalQuality("organised");    // "Well-organised thermals"
en.describeConfidence("medium");           // "Medium confidence"

en.formatHour("2026-08-19T14:00", site.timezone);      // "16:00"
en.formatInstant("2026-08-19T14:00", site.timezone);   // "19 August at 16:00"

en.DISCLAIMER;   // "Advisory forecast only. This does not replace..."
```

**Functions**

| Signature | What it does |
|---|---|
| `const describeCapeBand: (band: CapeBand) => string` | — |
| `const describeCeilingLimit: (limit: CeilingLimit) => string` | — |
| `const describeConfidence: (level: ConfidenceLevel) => string` | — |
| `const describeFactor: (id: FactorId) => string` | — |
| `const describeHeatFluxSource: (source: HeatFluxSource) => string` | — |
| `const describeLayer: (kind: StableLayerKind) => string` | — |
| `const describeLevel: (level: SoaringLevel) => string` | — |
| `const describeLiftedIndex: (band: LiftedIndexBand) => string` | — |
| `const describeLiftedIndexSource: (source: LiftedIndexSource) => string` | — |
| `const describeOverdevelopment: (l: OverdevelopmentLevel) => string` | — |
| `const describeRidgeLift: (band: RidgeLiftBand) => string` | — |
| `const describeThermalQuality: (q: ThermalQuality) => string` | — |
| `const describeVeto: (id: VetoId) => string` | — |
| `const describeWave: (potential: WavePotential) => string` | — |
| `const describeWaveMethod: (method: WaveMethod) => string` | — |
| `function formatHour(iso: string, timezone: string): string` | Local time only, for compact labels. |
| `function formatInstant(iso: string, timezone: string): string` | Site-local date and time, formatted in English. |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DISCLAIMER` | `const DISCLAIMER = "Advisory forecast only. This does not replace an official weather briefing or the pilot in command's judgment."` | Disclaimer the consumer must display alongside any forecast. |


---

This reference covers the **397 exported symbols** across the fifteen entry points of the package. It is generated from the published `.d.ts` files, so it cannot deviate from what compiles.
