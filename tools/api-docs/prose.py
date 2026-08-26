import json, pathlib

HERE = pathlib.Path(__file__).resolve().parent

M = {}

M["."] = dict(import_="soarwx", intro="""
The root only exports cross-cutting concerns: the `Result` type, the site
description and the mandatory attribution. It contains no physics.

`Site` is the input to everything. `elevationMslM` is not optional: it anchors
AGL, determines which pressure levels fall below ground, and is sent to
Open-Meteo so that downscaling uses the airfield elevation rather than that of
a 90 m grid cell. `timezone` isn't optional either: requesting a day with
`timezone=UTC` makes the Spanish "day" run from 02:00 to 02:00 local, losing
the thermal afternoon.
""", example="""
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
""")

M["units"] = dict(import_="soarwx/units", intro="""
Branded types, physical constants and conversions. This is the module that
prevents the predecessor's recurring bug: mixing km/h with m/s, or feet with
metres, in a formula that still compiles and returns a plausible number.

Derived constants are **derived**, not tabulated. `GAMMA_D` is `G / CP`, not
0.0098. `FEET_PER_METRE` is `1 / 0.3048`, not 3.28084: tabulating it introduced
a round-trip error of 3·10⁻⁸ that no reasonable tolerance test detects.

The constructors (`K`, `Pa`, `m`, `mps`, `deg`, `wm2`, `jkg`, `kgkg`) and the types
they produce carry no description in the table: the signature **is** the
documentation.
""", example="""
import { K, Pa, m, mps, celsiusToK, msToKnots, hPaToPa, GAMMA_D, CP, G } from "soarwx/units";
import type { Kelvin, MPerS } from "soarwx/units";

const t: Kelvin = celsiusToK(34.6);        // 307.75 K
const p = hPaToPa(909);                    // 90900 Pa
const wind: MPerS = mps(5.2);

msToKnots(wind);                           // 10.1 — for display only
GAMMA_D === G / CP;                        // true: derived, not tabulated

// Branding is what prevents the unit bug:
// saturationVapourPressure(p)   ← won't compile: Pascal where Kelvin expected
""")

M["thermo"] = dict(import_="soarwx/thermo", intro="""
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
""", example="""
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
""")

M["sounding"] = dict(import_="soarwx/sounding", intro="""
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
""", example="""
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
""")

M["convection"] = dict(import_="soarwx/convection", intro="""
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
""", example="""
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
""")

M["clouds"] = dict(import_="soarwx/clouds", intro="""
Cumulus base, depth, overdevelopment and usable ceiling.

The base is **not** the LCL of the instantaneous surface parcel: it is the
condensation level of the **mixed-layer parcel**, using the layer's mean mixing
ratio and the forecast maximum temperature. A thermometer 2 m above irrigated
grass does not describe the column that rises.

`usableCeiling` is the function that decides the number the pilot looks at, and
it **declares why**: `hcrit`, cloudbase, the thermal top, or overcast skies.
Without the reason, a low ceiling doesn't tell you whether the problem is the
cloud, the thermal, or the shading.
""", example="""
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
""")

M["stability"] = dict(import_="soarwx/stability", intro="""
Stability indices, all derived from the **same** sounding and the same model.

**CAPE is risk, never merit.** It does not appear in `FactorId`, only in `VetoId`.
Scoring it as good while simultaneously vetoing it — the predecessor gave top marks
at 2400 J/kg while being 100 J/kg away from triggering its own veto — is the
contradiction this library exists to fix.

The **Lifted Index describes the atmosphere above the boundary layer**, not inside
it. A 3000 m mixed layer with LI +1.6 is an excellent day. Since 0.8.0 the
stability veto additionally requires the ceiling to be low.
""", example="""
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
""")

M["orographic"] = dict(import_="soarwx/orographic", intro="""
Ridge lift and wave, **from the real geometry of the ridge**, not from
hand-written bearing sectors.

The predecessor had a hard-coded 310° for "the Guadarrama". The actual normal of
La Mujer Muerta is 338°: 28° of error, costing cos 28° = 0.887 of the
perpendicular component. Here the ridge enters as `RidgeSpec` and the consumer
supplies it.

Wave is judged by the **Scorer parameter** (`l² = N²/U² − U″/U`) computed from
the sounding. The sector-and-threshold heuristic exists as a fallback, and when
it is used it is declared in `method`.
""", example="""
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
""")

M["aircraft"] = dict(import_="soarwx/aircraft", intro="""
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
""", example="""
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
""")

M["forecast"] = dict(import_="soarwx/forecast", intro="""
How numbers become a verdict, with the breakdown in plain sight.

**Factors score by bands** and each one returns its value, its score, its weight
and whether it passes. **Vetoes cap, they don't subtract**: an overcast sky
doesn't take off half a point — it prevents going above level 1 no matter how
well everything else scores. And **no factor rewards what a veto penalises**,
which is the rule that keeps CAPE out.

The best hour is ranked by usable ceiling and level after vetoes, never by how
many factors came out green.
""", example="""
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
""")

M["report"] = dict(import_="soarwx/report", intro="""
`computeDay` is the library's seam: **everything above it is tested with no
network and no clock**. It takes hourly observations already in SI and returns
the full day — scored hours, windows, best moment, attribution.

It is pure and deterministic. The same input yields the same output byte for
byte, and there is a test that runs it a hundred times to verify.

Each `SoaringHour` carries its `sounding` inside, so the consumer can draw the
skew-T for that hour without making another request.
""", example="""
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
""")

M["openmeteo"] = dict(import_="soarwx/openmeteo", intro="""
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
""", example="""
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
""")

M["render"] = dict(import_="soarwx/render", intro="""
**SVG string** generators. Zero dependencies, zero framework, zero JavaScript
sent to the client. The consumer inserts the string wherever they like.

Colours come from CSS custom properties (`--chart-1..5`) with literal fallbacks,
so they work in light and dark mode without recomputing anything. Everything
carries `<title>` and `<desc>`, and inserted text is escaped.

The wind panel scaling picks the step **in the unit being labelled**: requesting
km/h and computing the step in m/s produces labels like 9, 18, 27.
""", example="""
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
""")

M["i18n/es"] = dict(import_="soarwx/i18n/es", intro="""
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
""", example="""
import * as es from "soarwx/i18n/es";

es.describeLevel(4);                       // the level, in words
es.describeCeilingLimit("hcrit");          // why the ceiling is what it is
es.describeVeto("stable_atmosphere");      // "Atmósfera estable sobre una capa convectiva corta"
es.describeThermalQuality("organised");
es.describeConfidence("medium");

es.formatHour("2026-08-19T14:00", site.timezone);      // "16:00" in summer
es.formatInstant("2026-08-19T14:00", site.timezone);   // with day and month

es.DISCLAIMER;   // does not replace an official briefing or the pilot's judgment
""")

M["i18n/en"] = dict(import_="soarwx/i18n/en", intro="""
The English localization module. Turns numbers and enums from the core into natural
English for pilots.

Uses glider pilot terminology rather than meteorologist jargon. Date formatting
uses the site's timezone with standard British English conventions (en-GB, 24h clock).
""", example="""
import * as en from "soarwx/i18n/en";

en.describeLevel(4);                       // "Good"
en.describeCeilingLimit("hcrit");          // "limited by thermal strength"
en.describeVeto("stable_atmosphere");      // "Stable atmosphere above a shallow convective layer"
en.describeThermalQuality("organised");    // "Well-organised thermals"
en.describeConfidence("medium");           // "Medium confidence"

en.formatHour("2026-08-19T14:00", site.timezone);      // "16:00"
en.formatInstant("2026-08-19T14:00", site.timezone);   // "19 August at 16:00"

en.DISCLAIMER;   // "Advisory forecast only. This does not replace..."
""")

out = {k: {"import": v["import_"], "intro": v["intro"], "example": v["example"]} for k, v in M.items()}
(HERE / "prose.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("modules:", len(out))
