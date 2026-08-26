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
| `const andThen: <T, U, E>(r: Result<T, E>, f: (v: T) => Result<U, E>) => Result<U, E>` | Encadena una operación que también puede fallar, sin anidar comprobaciones. |
| `const err: (code: SoarwxErrorCode, message: string, detail?: Readonly<Record<string, unknown>>) => Result<never>` | Construye un resultado fallido con su código estable y su contexto. |
| `const mapResult: <T, U, E>(r: Result<T, E>, f: (v: T) => U) => Result<U, E>` | Transforma el valor si lo hay, y propaga el error si no. |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `isErr` | `const isErr: <T, E>(r: Result<T, E>) => r is { ok: false; error: E; }` | Estrecha el tipo al caso fallido. |
| `isOk` | `const isOk: <T, E>(r: Result<T, E>) => r is { ok: true; value: T; }` | Estrecha el tipo al caso correcto. |
| `ok` | `const ok: <T>(value: T) => Result<T, never>` | Envuelve un valor como resultado correcto. |
| `OPEN_METEO_ATTRIBUTION` | `const OPEN_METEO_ATTRIBUTION = "Datos meteorol\u00F3gicos de Open-Meteo.com (https://open-meteo.com), licencia CC BY 4.0."` | Atribución exigida por la licencia CC BY 4.0 de los datos de Open-Meteo. |
| `SOARWX_VERSION` | `const SOARWX_VERSION = "0.12.0"` | Versión de la librería. |
| `unwrapOr` | `const unwrapOr: <T, E>(r: Result<T, E>, fallback: T) => T` | Devuelve el valor o el respaldo. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Result` | `type Result<T, E = SoarwxError> = { readonly ok: true; readonly value: T; } \| { readonly ok: false; readonly error: E; }` | Resultado de una operación que puede no tener respuesta. |
| `RidgeSpec` | `interface RidgeSpec — 5 fields` | Geometría de una cresta, como dato. |
| `Site` | `interface Site — 8 fields` | Emplazamiento a evaluar. |
| `SoarwxError` | `interface SoarwxError — 3 fields` | Error de la librería. |
| `SoarwxErrorCode` | `type SoarwxErrorCode = …` | Resultado tipado. |
| `SurfaceSpec` | `interface SurfaceSpec — 4 fields` | Terreno del emplazamiento. |
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
| `const fpmToMs: (fpm: number) => MPerS` | Pies por minuto a metros por segundo. |
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
| `const normaliseBearing: (d: number) => Degrees` | Normaliza un rumbo al intervalo [0, 360). |
| `const Pa: (v: number) => Pascal` | — |
| `const paToHPa: (p: Pascal) => number` | — |
| `const wm2: (v: number) => WPerM2` | — |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CP` | `const CP = 1004.67` | Calor específico del aire seco a presión constante, J/(kg·K). |
| `CPV` | `const CPV = 1879` | Calor específico del vapor de agua a presión constante, J/(kg·K). |
| `EPS` | `const EPS: number` | Cociente de constantes de gas, Rd/Rv. |
| `G` | `const G = 9.80665` | Aceleración de la gravedad estándar, m/s². |
| `GAMMA_D` | `const GAMMA_D: number` | Gradiente adiabático seco, K/m. |
| `KAPPA` | `const KAPPA: number` | Exponente de Poisson, Rd/cp. |
| `LV_SLOPE` | `const LV_SLOPE = 2370` | Pendiente de la dependencia térmica del calor latente, J/(kg·K). |
| `LV0` | `const LV0 = 2501000` | Calor latente de vaporización a 0 °C, J/kg. |
| `P0` | `const P0: Pascal` | Presión de referencia para la temperatura potencial, Pa. |
| `RD` | `const RD = 287.05` | Constante específica del aire seco, J/(kg·K). |
| `RV` | `const RV = 461.5` | Constante específica del vapor de agua, J/(kg·K). |
| `T0_CELSIUS` | `const T0_CELSIUS: Kelvin` | Cero de la escala Celsius, en kelvin. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Branded` | `type Branded<T, B extends string> = T & { readonly [brand]: B; }` | Número con una marca de unidad que solo existe en tiempo de compilación. |
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
| `function checkSaturationRange(tempK: Kelvin): SoarwxError \| null` | Comprueba si la temperatura cae dentro del rango de validez de la ec. | Bolton (1980) |
| `function dewpointFromMixingRatio(mixingRatioKgKg: KgPerKg, pressurePa: Pascal): Kelvin` | Punto de rocío a partir de la razón de mezcla y la presión. | Wallace & Hobbs (1980) |
| `function dewpointFromRelativeHumidity(tempK: Kelvin, rhFrac: number): Kelvin` | Punto de rocío a partir de la humedad relativa. | Bolton (1980) |
| `function dewpointFromVapourPressure(vapourPressurePa: Pascal): Kelvin` | Punto de rocío a partir de la presión de vapor, invirtiendo la ec. | Bolton (1980) |
| `function dryAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal): Kelvin` | Ascenso adiabático seco: temperatura al llevar la parcela a otra presión conservando la temperatura potencial. | Poisson |
| `function latentHeatOfVaporisation(tempK: Kelvin): number` | Calor latente de vaporización dependiente de la temperatura. | T (1980) |
| `function lcl(tempK: Kelvin, dewpointK: Kelvin, pressurePa: Pascal): LclResult` | LCL completo: temperatura, presión y altura sobre el punto de partida. | Bolton (1980) |
| `function lclTemperature(tempK: Kelvin, dewpointK: Kelvin): Kelvin` | Temperatura del LCL. | Bolton (1980) |
| `function mixingRatio(dewpointK: Kelvin, pressurePa: Pascal): KgPerKg` | Razón de mezcla a partir del punto de rocío. | Wallace & Hobbs |
| `function moistAdiabaticLift(tempK: Kelvin, fromPa: Pascal, toPa: Pascal, opts?: IntegrationOptions): Result<Kelvin>` | Ascenso pseudoadiabático saturado por integración numérica con paso adaptativo. | Wallace & Hobbs |
| `function moistHeatCapacity(specificHumidity: number): number` | Calor específico a presión constante del aire húmedo. | Romps (2017) |
| `function potentialTemperature(tempK: Kelvin, pressurePa: Pascal): Kelvin` | Temperatura potencial. | Poisson |
| `function relativeHumidity(tempK: Kelvin, dewpointK: Kelvin): number` | Humedad relativa respecto al agua líquida, en fracción 0..1. | Bolton (1980) |
| `function saturationMixingRatio(tempK: Kelvin, pressurePa: Pascal): KgPerKg` | Razón de mezcla de saturación. | Wallace & Hobbs |
| `function saturationVapourPressure(tempK: Kelvin): Pascal` | Presión de vapor de saturación sobre agua líquida. | Bolton (1980) |
| `function specificHumidity(mixingRatioKgKg: KgPerKg): number` | Humedad específica a partir de la razón de mezcla. | Wallace & Hobbs |
| `function temperatureFromPotential(thetaK: Kelvin, pressurePa: Pascal): Kelvin` | Inversa de {@link potentialTemperature}: temperatura a una presión dada. | Poisson |
| `function virtualPotentialTemperature(tempK: Kelvin, pressurePa: Pascal, mixingRatioKgKg: KgPerKg): Kelvin` | Temperatura potencial virtual. | Stull |
| `function virtualTemperature(tempK: Kelvin, mixingRatioKgKg: KgPerKg): Kelvin` | Temperatura virtual. | Allen (2006) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `SATURATION_VALID_RANGE` | `const SATURATION_VALID_RANGE: { readonly minK: Kelvin; readonly maxK: Kelvin; }` | Rango de validez declarado por Bolton para su ec. |

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
| `function buildSounding(input: SoundingInput): Result<Sounding>` | Ensambla el sondeo: superficie, niveles de altura y niveles de presión, en orden de presión estrictamente descendente y sin nada bajo tierra. | R-1.1 a R-1.5 de docs/REQUIREMENTS.md |
| `function findInversions(sounding: Sounding, maxMslM?: Metres, minThicknessM?: number): readonly StableLayer[]` | Capas estables e inversiones por debajo de una altura dada. | Definición estándar de inversión y de estabilidad estática seca |
| `function fromComponents(uMs: number, vMs: number): WindVector` | Recompone módulo y dirección de procedencia a partir de las componentes. | Convención meteorológica estándar |
| `function heightLevelsToLevels(context: HeightLevelContext, raw: readonly RawHeightLevel[]): readonly Level[]` | Convierte niveles de altura en niveles del sondeo. | Conservación de la razón de mezcla en la capa mezclada (Stull |
| `function interpolateAtAgl(sounding: Sounding, aglM: Metres): Result<Level>` | Nivel interpolado a una altura sobre el terreno. |  |
| `function interpolateAtHeight(sounding: Sounding, mslM: Metres): Result<Level>` | Nivel interpolado a una altura sobre el nivel del mar. | Interpolación logarítmica en presión |
| `function interpolateAtPressure(sounding: Sounding, pressurePa: Pascal): Result<Level>` | Nivel interpolado a una presión dada. | Interpolación logarítmica en presión |
| `function maxGapBelow(sounding: Sounding, topMslM: Metres): Metres` | Mayor separación vertical entre niveles consecutivos por debajo de un techo. | R-1.4b de docs/REQUIREMENTS.md |
| `function meanWind(samples: readonly { readonly wind: WindVector; readonly weight: number; }[]): WindVector` | Media vectorial de una lista de vientos con pesos (típicamente espesores). | Media vectorial |
| `function pressureAtHeight(surfacePressurePa: Pascal, surfaceTempK: Kelvin, tempAtHeightK: Kelvin, mixingRatioKgKg: number, depthM: Metres): Pascal` | Presión a una altura sobre la superficie por la ecuación hipsométrica. | Wallace & Hobbs |
| `function pressureFromGeopotentialProfile(column: readonly PressureHeightPair[], targetMslM: Metres): Pascal \| null` | Presión a una altura, interpolando linealmente `ln(p)` frente a la altura geopotencial **del propio modelo**. | Relación hidrostática log-lineal |
| `function shearBetween(lower: WindVector, upper: WindVector, depthM: Metres): ShearResult` | Cizalladura vectorial entre dos vientos separados por un espesor dado. | Definición estándar de cizalladura vectorial |
| `function toComponents(speedMs: MPerS, fromDeg: Degrees): WindComponents` | Descompone un viento meteorológico (dirección DE DONDE viene) en componentes cartesianas. | Convención meteorológica estándar |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `ISOTHERMAL_LAPSE_K_PER_KM` | `const ISOTHERMAL_LAPSE_K_PER_KM = 0.5` | Por debajo de este gradiente térmico en módulo la capa se llama isoterma. |
| `MIN_LAYER_THICKNESS_M` | `const MIN_LAYER_THICKNESS_M = 100` | Espesor mínimo para considerar una capa. |
| `STABLE_THETA_GRADIENT_K_PER_KM` | `const STABLE_THETA_GRADIENT_K_PER_KM = 2` | Umbral de estabilidad en temperatura potencial. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `BuildOptions` | `interface BuildOptions — 2 fields` | — |
| `HeightLevelContext` | `interface HeightLevelContext — 5 fields` | — |
| `Level` | `interface Level — 8 fields` | — |
| `LevelSource` | `type LevelSource = "surface" \| "pressure_level" \| "height_level" \| "interpolated"` | — |
| `PressureHeightPair` | `interface PressureHeightPair — 2 fields` | Par (presión, altura) del que se deduce la relación p(z) del modelo. |
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
| `function bowenRatioFor(type: SurfaceType, soilMoistureFrac?: number): number` | Razón de Bowen interpolada entre suelo seco y húmedo. | Stull |
| `function buoyancyShearRatio(input: BuoyancyShearInput): Result<BuoyancyShearResult>` | Relación boyancia/cizalladura y calidad resultante de la térmica. | Glendening (DrJack) |
| `function convectiveVelocityScale(input: WStarInput): Result<WStarResult>` | Velocidad convectiva de Deardorff. | Allen (2006) |
| `function criticalHeight(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile): Result<CriticalHeightResult>` | Altura donde la ascendencia del núcleo cae por debajo del umbral de `hcrit` del perfil. | Glendening (DrJack) |
| `function detectFluxSign(samples: readonly FluxSample[], radiationThresholdWm2?: number, minSamples?: number): FluxSignDetection` | Detecta la convención de signo correlacionando el flujo con la radiación de onda corta: cuando la superficie recibe más de 200 W/m², el flujo de calor sensible va **hacia arriba**, y el signo que tome en esas horas define la convención del modelo. | docs/OPEN_METEO_INTEGRATION.md §4.1 (convenciones medidas) |
| `function expectedVarioAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres, profile: AircraftProfile): MPerS` | Lectura esperada de variómetro a una altura: ascendencia del núcleo menos el régimen de caída del avión virando. | Glendening (DrJack): «restar el régimen de caída del planeador para |
| `function frictionVelocity(surfaceWindMs: MPerS, roughnessLengthM: Metres, windHeightM?: number): number` | Velocidad de fricción por la ley logarítmica del viento. | Ley logarítmica del perfil de viento |
| `function innerRadiusRatio(outerRadiusM: Metres): number` | Cociente entre radio interior y exterior del trapecio revuelto. | Allen (2006) |
| `function meanClimbOverBand(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile, samples?: number): Result<MPerS>` | Ascendencia media que ve el variómetro a lo largo de una subida completa, desde el 10 % de la capa hasta la altura crítica. | Allen (2006) |
| `function netLongwaveUpWm2(tempK: Kelvin, dewpointK: Kelvin, cloudCoverFrac: number): number` | Onda larga neta ascendente en superficie, parametrización de FAO-56 con la nubosidad en lugar del cociente de radiación medida frente a cielo claro. | Allen (1998) |
| `function normaliseUpwardFlux(fluxWm2: number, convention: FluxSignConvention): number \| null` | Devuelve el flujo con el criterio interno: **positivo hacia arriba**. | docs/OPEN_METEO_INTEGRATION.md §4.1 |
| `function reconcileMixingHeight(parcelAglM: Metres, modelAglM: Metres \| null, toleranceFrac?: number): MixingHeightResult` | — | Glendening (DrJack): «cuando la mezcla resulta de la cizalladura y no |
| `function superadiabaticExcessK(sounding: Sounding, referenceAglM?: Metres): number` | Exceso de temperatura potencial de la superficie sobre la capa mezclada. | Estructura de la capa superficial convectiva |
| `function surfaceHeatFlux(input: HeatFluxInput): HeatFluxResult` | Flujo de calor sensible y su forma cinemática y virtual. | Allen (2006) |
| `function thermalIndexAt(sounding: Sounding, maxSurfaceTempK: Kelvin, mslM: Metres): Result<number>` | Índice térmico a una altura sobre el nivel del mar. | Método clásico del índice térmico |
| `function thermalTop(sounding: Sounding, maxSurfaceTempK: Kelvin): Result<ThermalTopResult>` | Techo térmico por el método de la parcela: altura a la que una parcela que parte de la superficie con la temperatura máxima prevista deja de estar más caliente que el entorno. | Método de la parcela |
| `function triggerTemperature(sounding: Sounding): Result<TriggerResult>` | Temperatura de disparo y nivel de condensación por convección. | Método clásico del CCL y de la temperatura convectiva |
| `function updraftMeanAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS` | Velocidad media de ascenso dentro de la térmica. | Allen (2006) |
| `function updraftOuterRadius(zAglM: Metres, ziAglM: Metres): Metres` | Radio exterior de la térmica. | Allen (2006) |
| `function updraftPeakAt(wStarMs: MPerS, zAglM: Metres, ziAglM: Metres): MPerS` | Velocidad en el núcleo de la térmica, a partir de la media y de la geometría del trapecio revuelto. | Allen (2006) |
| `function updraftProfile(wStarMs: MPerS, ziAglM: Metres, options?: ProfileOptions): readonly ProfilePoint[]` | Perfil muestreado, para gráfica y para búsquedas numéricas. | Allen (2006) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `BROKEN_THRESHOLD` | `const BROKEN_THRESHOLD = 5` | Umbrales empíricos de DrJack. |
| `DAYTIME_RADIATION_THRESHOLD_WM2` | `const DAYTIME_RADIATION_THRESHOLD_WM2 = 200` | Radiación por encima de la cual se considera que la superficie se calienta. |
| `DEFAULT_SURFACE_TYPE` | `const DEFAULT_SURFACE_TYPE: SurfaceType` | Terreno supuesto cuando el emplazamiento no lo declara. |
| `GROUND_FLUX_FRACTION` | `const GROUND_FLUX_FRACTION = 0.1` | Fracción de la radiación neta que se va al suelo (Stull, método del porcentaje). |
| `MIN_OUTER_RADIUS_M` | `const MIN_OUTER_RADIUS_M = 10` | Radio exterior mínimo, en metros (Allen ec. |
| `MIN_SAMPLES_FOR_DETECTION` | `const MIN_SAMPLES_FOR_DETECTION = 3` | Muestras diurnas mínimas para decidir. |
| `ORGANISED_THRESHOLD` | `const ORGANISED_THRESHOLD = 10` | — |
| `SHEAR_DRIVEN_DIVERGENCE_FRAC` | `const SHEAR_DRIVEN_DIVERGENCE_FRAC = 0.5` | Umbral de divergencia por encima del cual se sospecha mezcla no convectiva. |
| `SURFACE_DEFAULTS` | `const SURFACE_DEFAULTS: Readonly<Record<SurfaceType, SurfaceDefaults>>` | — |
| `SURFACE_LAYER_TOP_AGL_M` | `const SURFACE_LAYER_TOP_AGL_M = 200` | Altura de referencia para medir el exceso superadiabático de la capa superficial. |
| `SURFACE_WIND_HEIGHT_M` | `const SURFACE_WIND_HEIGHT_M = 10` | Altura de referencia del viento de superficie. |
| `VON_KARMAN` | `const VON_KARMAN = 0.4` | Constante de von Kármán. |
| `WORKING_BAND_BOTTOM_FRAC` | `const WORKING_BAND_BOTTOM_FRAC = 0.1` | Altura relativa desde la que se considera que empieza la banda de trabajo. |
| `WORKING_THERMAL_INDEX_K` | `const WORKING_THERMAL_INDEX_K = -2` | Índice térmico de trabajo. |
| `ZERO_CROSSING_RATIO` | `const ZERO_CROSSING_RATIO: number` | Altura relativa a la que la velocidad media se anula: 1/1.1. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `BuoyancyShearInput` | `interface BuoyancyShearInput — 4 fields` | — |
| `BuoyancyShearResult` | `interface BuoyancyShearResult — 4 fields` | — |
| `CriticalHeightResult` | `interface CriticalHeightResult — 3 fields` | — |
| `FluxSample` | `interface FluxSample — 2 fields` | — |
| `FluxSignConvention` | `type FluxSignConvention = "up_positive" \| "down_positive" \| "unknown"` | Normalización del signo del flujo de calor sensible. |
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
| `function cumulusBase(sounding: Sounding, mixingHeightAglM: Metres, maxSurfaceTempK: Kelvin, thermalTopAglM?: Metres): Result<CloudBaseResult>` | Base de cumulus por el nivel de condensación de la parcela de capa mezclada. | Bolton (1980) |
| `function cumulusDepth(cloudBaseAglM: Metres, thermalTopAglM: Metres): Metres` | Espesor del cumulus: cuánto se desarrolla la nube por encima de su base. | Indicador clásico de desarrollo convectivo |
| `function isBlueDay(cloudBaseAglM: Metres, thermalTopAglM: Metres): boolean` | Día azul: la condensación queda por encima del techo térmico, así que las térmicas no llegan a marcarse con nubes. | Definición operativa habitual en vuelo a vela |
| `function mixedLayerMean(sounding: Sounding, topAglM: Metres): Result<MixedLayerResult>` | Medias ponderadas por masa (por espesor en presión) desde la superficie hasta el techo de la capa mezclada. | Definición de parcela de capa mezclada |
| `function overdevelopmentRisk(input: OverdevelopmentInput): OverdevelopmentResult` | — | Indicadores clásicos de desarrollo convectivo |
| `function usableCeiling(input: CeilingInput): CeilingResult` | Techo utilizable: el menor de la altura crítica, el techo térmico y la base de nubes, con el motivo declarado. | Composición de los criterios de Glendening (DrJack): `hcrit` como |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DEPTH_THRESHOLDS_M` | `const DEPTH_THRESHOLDS_M: readonly [1000, 2000, 3000]` | Espesores de cumulus, en metros, a partir de los que empieza a preocupar. |
| `WEAK_INHIBITION_JKG` | `const WEAK_INHIBITION_JKG = 25` | Inhibición por debajo de la cual nada frena el desarrollo, en J/kg. |

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
| `function capeRisk(capeJkg: number \| null, convectiveInhibitionJkg?: number \| null): CapeRisk` | Clasifica la CAPE como **riesgo**, con la inhibición que la tapa. | Glendening (DrJack) |
| `function kIndex(sounding: Sounding): Result<number>` | K-Index de George. | George (1960) |
| `function liftedIndex(sounding: Sounding, surfaceTempK?: Kelvin): Result<number>` | Lifted Index de parcela de superficie. | Galway (1956) |
| `function liftedIndexBand(li: number): LiftedIndexBand` | Diagnóstico ordinal del Lifted Index. | Galway (1956) |
| `function totalTotals(sounding: Sounding): Result<number>` | Total Totals. | Miller (1972) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CAPE_BANDS_JKG` | `const CAPE_BANDS_JKG: { readonly weak: 300; readonly moderate: 1000; readonly strong: 2500; readonly extreme: 5300; }` | Bandas de CAPE y probabilidad de tormenta asociada. |
| `INHIBITING_CIN_JKG` | `const INHIBITING_CIN_JKG = 50` | Inhibición convectiva a partir de la cual se considera que tapa. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `CapeBand` | `type CapeBand = "none" \| "weak" \| "moderate" \| "strong" \| "extreme"` | CAPE como riesgo, nunca como virtud. |
| `CapeRisk` | `interface CapeRisk — 5 fields` | — |
| `LiftedIndexBand` | `type LiftedIndexBand = "stable" \| "marginally_unstable" \| "moderately_unstable" \| "very_unstable" \| "extremely_unstable"` | Bandas ordinales del Lifted Index, para el diagnóstico de convección profunda. |


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
| `function ridgeLift(ridge: RidgeSpec, windAtCrest: WindVector): RidgeLiftResult` | Sustentación de ladera a partir del viento a la altura de la cresta. | Flujo forzado sobre relieve |
| `function scorerParameter(sounding: Sounding, flowTowardDeg: number): Result<readonly ScorerPoint[]>` | Perfil del parámetro de Scorer a lo largo de una dirección de flujo. | Scorer (1949) |
| `function wavePotential(sounding: Sounding, ridge: RidgeSpec): Result<WaveResult>` | Potencial de onda a sotavento de una cresta. | Scorer (1949) |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `LOWER_LAYER_DEPTH_M` | `const LOWER_LAYER_DEPTH_M = 1500` | Espesor de la capa baja sobre la cresta que se compara con la de arriba. |
| `MIN_ALONG_FLOW_MS` | `const MIN_ALONG_FLOW_MS = 2` | Viento mínimo a lo largo del flujo por debajo del cual el parámetro no significa nada. |
| `MIN_CROSS_RIDGE_MS` | `const MIN_CROSS_RIDGE_MS = 7.5` | Viento perpendicular mínimo para plantearse onda, en m/s (unos 15 nudos). |
| `RIDGE_LIFT_THRESHOLDS_MS` | `const RIDGE_LIFT_THRESHOLDS_MS: { readonly marginal: 4.1; readonly optimal: 7.7; readonly dangerous: 14.4; }` | Umbrales de la componente perpendicular, en m/s. |
| `STRONG_WAVE_DROP_FACTOR` | `const STRONG_WAVE_DROP_FACTOR = 2` | El criterio de Scorer marca el **mínimo** para que exista el primer modo atrapado. |
| `UPPER_LAYER_TOP_M` | `const UPPER_LAYER_TOP_M = 4000` | Techo de la capa alta que se compara con la baja. |

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
| `function circlingSinkFactor(bankDeg: number): number` | Cuánto crece el mínimo hundimiento al virar, respecto al de vuelo recto. | Relación clásica de viraje en planeador |
| `function findAircraftProfile(id: string): AircraftProfile \| undefined` | Busca un perfil por identificador. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `AIRCRAFT_PROFILES` | `const AIRCRAFT_PROFILES: readonly AircraftProfile[]` | El catálogo completo, en orden de presentación. |
| `ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS` | `const ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS: MPerS` | Los 25 nudos exactos, para quien prefiera el redondeo del nudo al del artículo. |
| `ASH_25` | `const ASH_25: AircraftProfile` | Schleicher ASH 25. |
| `ASK_21` | `const ASK_21: AircraftProfile` | Schleicher ASK 21. |
| `ASTIR_CS` | `const ASTIR_CS: AircraftProfile` | Grob Astir CS. |
| `BANK_40_SINK_FACTOR` | `const BANK_40_SINK_FACTOR: number` | El factor a `REFERENCE_BANK_DEG`. |
| `DG_1001_CLUB` | `const DG_1001_CLUB: AircraftProfile` | DG-1001 Club. |
| `DUO_DISCUS` | `const DUO_DISCUS: AircraftProfile` | Schempp-Hirth Duo Discus. |
| `G103A_TWIN_II` | `const G103A_TWIN_II: AircraftProfile` | Grob G103A Twin II Acro. |
| `GLIDER_CLUB` | `const GLIDER_CLUB: AircraftProfile` | Planeador de club. |
| `GLIDER_PERFORMANCE` | `const GLIDER_PERFORMANCE: AircraftProfile` | Monoplaza moderno de 15 a 18 m. |
| `GLIDER_TRAINER` | `const GLIDER_TRAINER: AircraftProfile` | Biplaza de escuela a peso doble, o club con el ala sucia. |
| `LS8E_15` | `const LS8E_15: AircraftProfile` | LS8-e neo, 15 m. |
| `LS8E_18` | `const LS8E_18: AircraftProfile` | LS8-e neo, 18 m. |
| `RASP_HCRIT_THRESHOLD_MS` | `const RASP_HCRIT_THRESHOLD_MS: MPerS` | Umbral de `hcrit`. |
| `RASP_REFERENCE` | `const RASP_REFERENCE: AircraftProfile` | El criterio de DrJack tal cual, usado como si fuera un avión. |
| `REFERENCE_BANK_DEG` | `const REFERENCE_BANK_DEG = 40` | Alabeo de referencia para virar en térmica. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `AircraftProfile` | `interface AircraftProfile — 7 fields` | — |
| `AircraftProfileId` | `type AircraftProfileId = …` | Identificadores del catálogo. |


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
| `function aggregate(factors: readonly Factor[], vetoes: readonly Veto[], thresholds?: readonly [number, number, number, number]): SoaringScore` | Índice de vuelo a partir de los factores y los vetos. | R-10.1 a R-10.5 de docs/REQUIREMENTS.md |
| `function bestHour<T extends ScoredHour>(hours: readonly T[]): T \| null` | Mejor hora del día. | R-11.3 de docs/REQUIREMENTS.md |
| `function buildFactor(id: FactorId, value: number, spec: FactorSpec): Factor` | Construye un factor a partir de su valor crudo y su especificación. | R-10.2 de docs/REQUIREMENTS.md |
| `function confidenceFrom(samples: readonly ModelSample[]): Confidence \| null` | Confianza medida como **dispersión entre modelos**, no inventada. | R-12.1 a R-12.3 de docs/REQUIREMENTS.md |
| `function evaluateVetoes(input: VetoInput): readonly Veto[]` | Vetos aplicables a una hora. | R-10.3 |
| `function findWindows(hours: readonly ScoredHour[], minLevel: SoaringLevel, minWindowHours?: number): readonly SoaringWindow[]` | Ventanas continuas de horas que alcanzan al menos `minLevel`. | R-11.2 de docs/REQUIREMENTS.md |
| `function resolveScoring(config?: ScoringConfig): ResolvedScoring` | Mezcla la configuración del consumidor con los valores por defecto. | R-10.4 de docs/REQUIREMENTS.md |
| `function scoreBand(value: number, band: Band): number` | Puntuación de un valor dentro de su banda, en el intervalo [0, 1]. | Versión pura del criterio de bandas del predecesor |
| `function vetoCap(vetoes: readonly Veto[]): 1 \| 2 \| 3 \| 4 \| 5` | Nivel máximo que permiten los vetos presentes. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `CAPPED_CEILING_AGL_M` | `const CAPPED_CEILING_AGL_M = 1500` | Techo por debajo del cual una atmósfera estable sí limita el día. |
| `CEILING_SPREAD_THRESHOLDS_M` | `const CEILING_SPREAD_THRESHOLDS_M: { readonly high: 300; readonly medium: 800; }` | Dispersión de techo, en metros, que separa los niveles de confianza. |
| `DEFAULT_FACTORS` | `const DEFAULT_FACTORS: Readonly<Record<FactorId, FactorSpec>>` | Configuración por defecto, calibrada para planeador. |
| `DEFAULT_LEVEL_THRESHOLDS` | `const DEFAULT_LEVEL_THRESHOLDS: readonly [number, number, number, number]` | Umbrales de nivel sobre la puntuación agregada. |
| `FACTOR_OK_THRESHOLD` | `const FACTOR_OK_THRESHOLD = 0.6` | Un factor se da por cumplido a partir de esta puntuación. |
| `MIN_WINDOW_HOURS` | `const MIN_WINDOW_HOURS = 2` | Una hora suelta no hace ventana. |
| `SEVERE_CAPE_JKG` | `const SEVERE_CAPE_JKG = 3500` | CAPE a partir de la cual el veto es severo, en J/kg. |
| `STORM_K_INDEX` | `const STORM_K_INDEX = 25` | K-Index a partir del cual una CAPE alta se considera tormentosa. |
| `STRONG_WIND_MS` | `const STRONG_WIND_MS = 12.87` | Viento en superficie a partir del cual el día se topa, en m/s (25 nudos). |
| `STRONGLY_STABLE_LI` | `const STRONGLY_STABLE_LI = 2` | LI por encima del cual la estabilidad es franca, no marginal. |
| `UNUSABLE_CEILING_AGL_M` | `const UNUSABLE_CEILING_AGL_M = 800` | Techo por debajo del cual el día no da para volar. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Band` | `interface Band — 4 fields` | Puntuación por bandas. |
| `Confidence` | `interface Confidence — 4 fields` | — |
| `ConfidenceLevel` | `type ConfidenceLevel = "low" \| "medium" \| "high"` | — |
| `Factor` | `interface Factor — 7 fields` | — |
| `FactorId` | `type FactorId = "climb_strength" \| "usable_ceiling" \| "lapse_rate" \| "thermal_quality" \| "surface_wind" \| "moisture" \| "cloud_cover"` | — |
| `FactorSpec` | `interface FactorSpec — 4 fields` | — |
| `ModelSample` | `interface ModelSample — 3 fields` | — |
| `ResolvedScoring` | `interface ResolvedScoring — 2 fields` | — |
| `ScoredHour` | `interface ScoredHour — 4 fields` | Lo mínimo que necesita esta capa de cada hora. |
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
| `function computeDay(input: ComputeDayInput): Result<SoaringDay>` | Calcula el día completo. | docs/SPEC.md §12 |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `BROKEN_COVER_FRAC` | `const BROKEN_COVER_FRAC = 0.625` | Cobertura a partir de la cual se considera cielo roto (BKN). |
| `LOW_MID_CUTOFF_MSL_M` | `const LOW_MID_CUTOFF_MSL_M = 3000` | Altura sobre el nivel del mar que separa nubosidad baja de media. |
| `OVERCAST_COVER_FRAC` | `const OVERCAST_COVER_FRAC = 0.875` | Cobertura total a partir de la cual se considera cubierto (OVC). |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `ComputeDayInput` | `interface ComputeDayInput — 8 fields` | — |
| `HourCloud` | `interface HourCloud — 5 fields` | — |
| `HourlyObservation` | `interface HourlyObservation — 10 fields` | Una hora de entrada, ya normalizada a SI. |
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
| `function buildForecastRequest(site: Site, options: ForecastRequestOptions): HttpRequest` | Petición de previsión para un modelo. | R-13.3 a R-13.5 de docs/REQUIREMENTS.md |
| `function cacheKey(url: string, body: URLSearchParams): string` | Clave estable a partir del cuerpo de la petición. |  |
| `function centredRadiationWm2(response: OpenMeteoResponse, index: number): number` | Radiación centrada en la hora. | §4.7 de docs/OPEN_METEO_INTEGRATION.md |
| `function fetchForecast(site: Site, options: ForecastRequestOptions, clientOptions?: OpenMeteoOptions): Promise<Result<{ response: OpenMeteoResponse; request: HttpRequest; }>>` | Pide la previsión de un modelo y valida el eco y las unidades. |  |
| `function fetchSoaringDay(site: Site, dateLocal: string, options?: SoaringDayOptions): Promise<Result<MultiModelResult>>` | Día de vuelo para un emplazamiento y una fecha local. | docs/OPEN_METEO_INTEGRATION.md §6.1 y §6.4 |
| `function hasData(response: OpenMeteoResponse, key: string): boolean` | ¿La variable trae datos de verdad? Una clave presente con todo a `null` no es un dato. | §4.8 de docs/OPEN_METEO_INTEGRATION.md |
| `function levelsForSite(site: Site, available: readonly number[], marginM?: number): readonly number[]` | Niveles que merece la pena pedir para un emplazamiento. | R-1.2 y §5.2 de docs/OPEN_METEO_INTEGRATION.md |
| `function levelVariableNames(levelsHpa: readonly number[]): string[]` | Nombres completos de las variables de nivel para los niveles dados. |  |
| `function memoryCache(now?: () => number): CacheAdapter` | Caché en memoria, para Node y para pruebas. |  |
| `function missingVariables(response: OpenMeteoResponse, requested: readonly string[]): readonly string[]` | Variables pedidas que llegaron completamente vacías. |  |
| `function noopCache(): CacheAdapter` | Caché que no guarda nada. |  |
| `function normaliseForecast(response: OpenMeteoResponse, site: Site, requestedLevelsHpa: readonly number[]): Result<NormalisedForecast>` | Convierte la respuesta en observaciones horarias listas para `computeDay`. | docs/OPEN_METEO_INTEGRATION.md §6.1 |
| `function sendRequest(request: HttpRequest, options?: OpenMeteoOptions): Promise<Result<OpenMeteoResponse>>` | Lanza una petición con reintentos y caché. | §6.4 de docs/OPEN_METEO_INTEGRATION.md |
| `function sessionCache(): CacheAdapter` | Caché sobre `sessionStorage`, para navegador. |  |
| `function soundingModels(): readonly OpenMeteoModel[]` | Modelos utilizables para sondeo, ordenados por idoneidad. |  |
| `function standardAtmosphereHeightM(pressureHpa: number): number` | Altura de un nivel de presión en la atmósfera estándar internacional. | Atmósfera estándar internacional (ISA) |
| `function usableLevels(response: OpenMeteoResponse, levelsHpa: readonly number[]): readonly number[]` | ¿La respuesta trae suficientes niveles de presión con datos? */ |  |
| `function validateEcho(response: OpenMeteoResponse, site: Site): Result<OpenMeteoResponse>` | Comprueba que la respuesta corresponde a lo que se pidió. | R-13.3 y R-13.4 de docs/REQUIREMENTS.md |
| `function validateUnits(response: OpenMeteoResponse): Result<OpenMeteoResponse>` | Comprueba las unidades declaradas antes de convertir nada. | §4.7 de docs/OPEN_METEO_INTEGRATION.md |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `ABSENT_UNIT` | `const ABSENT_UNIT = "undefined"` | Unidad que Open-Meteo devuelve para una variable que el modelo **no sirve**: |
| `BELOW_GROUND_MARGIN_M` | `const BELOW_GROUND_MARGIN_M = 150` | Margen bajo la elevación por debajo del cual un nivel se considera bajo tierra. |
| `COMMERCIAL_FORECAST_URL` | `const COMMERCIAL_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast"` | — |
| `DAILY_VARIABLES` | `const DAILY_VARIABLES: readonly ["sunrise", "sunset"]` | — |
| `DEFAULT_RETRIES` | `const DEFAULT_RETRIES = 2` | — |
| `DEFAULT_TIMEOUT_MS` | `const DEFAULT_TIMEOUT_MS = 10000` | — |
| `ELEVATION_ECHO_TOLERANCE_M` | `const ELEVATION_ECHO_TOLERANCE_M = 1` | Tolerancia del eco de elevación, en metros. |
| `EXPECTED_UNITS` | `const EXPECTED_UNITS: Readonly<Record<string, string>>` | Unidades que se esperan de cada familia de variable. |
| `FORECAST_URL` | `const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"` | — |
| `HEIGHT_LEVELS_M` | `const HEIGHT_LEVELS_M: readonly [80, 120, 180]` | Alturas sobre el terreno. |
| `MIN_LEVELS_FOR_SOUNDING` | `const MIN_LEVELS_FOR_SOUNDING = 4` | Un modelo sirve para sondeo si aporta al menos cuatro niveles de presión. |
| `MODEL_CAPABILITIES` | `const MODEL_CAPABILITIES: Readonly<Record<OpenMeteoModel, ModelCapabilities>>` | Qué sirve cada modelo, **verificado contra la API en vivo** y no copiado de la documentación: la documentación lista variables que llegan como `null` para una coordenada dada. |
| `PRESSURE_LEVEL_VARIABLES` | `const PRESSURE_LEVEL_VARIABLES: readonly ["temperature", "dew_point", "wind_speed", "wind_direction", "geopotential_height", "cloud_cover"]` | Variables que se piden en cada nivel de presión. |
| `PRESSURE_LEVELS_HPA` | `const PRESSURE_LEVELS_HPA: readonly [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500]` | Niveles de presión. |
| `RECOMMENDED_ENSEMBLE` | `const RECOMMENDED_ENSEMBLE: readonly OpenMeteoModel[]` | Trío recomendado para dispersión: tres centros de predicción distintos. |
| `RETRYABLE_STATUS` | `const RETRYABLE_STATUS: readonly [429, 500, 502, 503, 504]` | Reintentos solo para estos códigos. |
| `SURFACE_VARIABLES` | `const SURFACE_VARIABLES: readonly ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "surface_pressure", "pressure_msl", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "temperature_80m", "wind_speed_80m", "wind_direction_80m", "temperature_120m", "wind_speed_120m", "wind_direction_120m", "temperature_180m", "wind_speed_180m", "wind_direction_180m", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "shortwave_radiation", "sensible_heat_flux", "latent_heat_flux", "cape", "convective_inhibition", "lifted_index", "boundary_layer_height", "soil_moisture_0_to_1cm", "is_day"]` | Catálogo de variables de Open-Meteo. |

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
| `OpenMeteoModel` | `type OpenMeteoModel = …` | Capacidades por modelo, **verificadas contra la API en vivo**. |
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
| `function document(options: DocumentOptions, body: string): string` | Documento SVG responsive y accesible. | R-14.4 y R-14.5 de docs/REQUIREMENTS.md |
| `function element(tag: string, attrs: Attrs, children?: string): string` | Elemento SVG con sus atributos escapados. |  |
| `function escapeText(value: string): string` | Escapa texto para que no pueda romper el documento. |  |
| `function legend(entries: readonly LegendEntry[], x: number, y: number, fontSizePx: number, labelColour: string): string` | Leyenda en una fila. |  |
| `function polygon(points: readonly (readonly [number, number])[], attrs: Attrs): string` | Polígono cerrado a partir de puntos ya proyectados. |  |
| `function polyline(points: readonly (readonly [number, number])[], attrs: Attrs): string` | Polilínea a partir de puntos ya proyectados a coordenadas del lienzo. |  |
| `function renderDayTimeline(day: SoaringDay, options?: TimelineOptions): string` | Evolución de la capa convectiva a lo largo del día. | R-14.2 de docs/REQUIREMENTS.md |
| `function renderSkewT(sounding: Sounding, options?: SkewTOptions): string` | Skew-T log-P de un sondeo. | Diagrama oblicuo estándar |
| `function renderUpdraftProfile(wStarMs: MPerS, ziAglM: Metres, profile: AircraftProfile, options?: UpdraftProfileOptions): string` | Perfil vertical de ascendencia para un `w*` y una capa dados. | Allen (2006) |
| `function resolvePalette(overrides?: Partial<Palette>): Palette` | Mezcla los colores que sobrescriba el consumidor sobre la paleta por defecto. |  |
| `function round(value: number, decimals?: number): string` | Redondea para no arrastrar ruido de coma flotante en el documento. |  |
| `function text(content: string, attrs: Attrs): string` | Elemento `<text>` con el contenido escapado. |  |

**Constants**

| Name | Declaration | What it is |
|---|---|---|
| `DEFAULT_PALETTE` | `const DEFAULT_PALETTE: Palette` | Paleta por defecto. |
| `LEVEL_OPACITY` | `const LEVEL_OPACITY: Readonly<Record<1 \| 2 \| 3 \| 4 \| 5, number>>` | Opacidad de la banda del índice: a más nivel, más sólida. |
| `MIN_FONT_SIZE_PX` | `const MIN_FONT_SIZE_PX = 10` | Tamaño de fuente mínimo. |
| `WIND_SHADE_THRESHOLDS_MS` | `const WIND_SHADE_THRESHOLDS_MS: { readonly brisk: 8.33; readonly cutoff: 12.87; }` | Umbrales de viento que se sombrean en la columna, en m/s. |
| `WINDOW_FILL_OPACITY` | `const WINDOW_FILL_OPACITY = 0.22` | Opacidad del fondo de una ventana volable. |

**Types**

| Name | Shape | Purpose |
|---|---|---|
| `Attrs` | `type Attrs = Readonly<Record<string, string \| number \| undefined>>` | Primitivas mínimas de SVG. |
| `DocumentOptions` | `interface DocumentOptions — 5 fields` | — |
| `HeightReference` | `type HeightReference = "agl" \| "msl"` | Referencia de las alturas rotuladas junto a la presión. |
| `LegendEntry` | `interface LegendEntry — 3 fields` | — |
| `Palette` | `type Palette = Readonly<Record<PaletteKey, string>>` | — |
| `PaletteKey` | `type PaletteKey = …` | Paleta. |
| `ProfileMarks` | `interface ProfileMarks — 3 fields` | — |
| `RenderOptions` | `interface RenderOptions — 6 fields` | — |
| `SkewTOptions` | `interface SkewTOptions extends RenderOptions — 10 fields` | — |
| `TimelineOptions` | `interface TimelineOptions extends RenderOptions — 3 fields` | — |
| `UpdraftProfileOptions` | `interface UpdraftProfileOptions extends RenderOptions — 2 fields` | — |
| `WindUnit` | `type WindUnit = "kmh" \| "kt" \| "ms"` | — |


### `soarwx/i18n/es`

The **only** module with prose. The core returns enums and numbers; this is where
they are translated. No physics function imports this module, and a test walks
`src/` to enforce that.

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


---

This reference covers the **379 exported symbols** across the fifteen entry points of the package. It is generated from the published `.d.ts` files, so it cannot deviate from what compiles.
