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
