import json, pathlib

HERE = pathlib.Path(__file__).resolve().parent

M = {}

M["."] = dict(import_="soarwx", intro="""
La raíz solo trae lo transversal: el tipo `Result`, la descripción del
emplazamiento y la atribución obligatoria. No contiene física.

`Site` es la entrada de todo. `elevationMslM` no es opcional: ancla el AGL, decide
qué niveles de presión caen bajo tierra y se envía a Open-Meteo para que el
downscaling se haga contra la cota del aeródromo y no contra la de una celda de
90 m. `timezone` tampoco: pedir un día con `timezone=UTC` hace que la jornada
española vaya de las 02:00 a las 02:00 y se pierda la tarde térmica.
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
      bearingDeg: deg(68),      // rumbo del eje de la cresta, 0..180
      slopeDeg: deg(16),
      crestMslM: m(2197),
      lengthM: m(11000),
    },
  ],
};

// El terreno entra como dato. No hay ni un emplazamiento codificado en la
// librería: `grep -ri "guadarrama" src/` está vacío, y hay una prueba que lo exige.

function height<T extends { aglM: number }>(r: Result<T>): number | null {
  return isOk(r) ? r.value.aglM : null;
}
""")

M["units"] = dict(import_="soarwx/units", intro="""
Tipos marcados, constantes físicas y conversiones. Es el módulo que impide el
error recurrente del predecesor: mezclar km/h con m/s, o pies con metros, en una
fórmula que sigue compilando y devuelve un número plausible.

Las constantes derivadas se **derivan**, no se tabulan. `GAMMA_D` es `G / CP`, no
0.0098. `FEET_PER_METRE` es `1 / 0.3048`, no 3.28084: tabularla daba un error de
ida y vuelta de 3·10⁻⁸ que ninguna prueba de tolerancia razonable detecta.

Los constructores (`K`, `Pa`, `m`, `mps`, `deg`, `wm2`, `jkg`, `kgkg`) y los tipos
que producen no llevan descripción en la tabla: la firma **es** la documentación.
""", example="""
import { K, Pa, m, mps, celsiusToK, msToKnots, hPaToPa, GAMMA_D, CP, G } from "soarwx/units";
import type { Kelvin, MPerS } from "soarwx/units";

const t: Kelvin = celsiusToK(34.6);        // 307.75 K
const p = hPaToPa(909);                    // 90900 Pa
const wind: MPerS = mps(5.2);

msToKnots(wind);                           // 10.1 — solo para presentar
GAMMA_D === G / CP;                        // true: derivada, no tabulada

// El marcado es lo que evita el bug de unidades:
// saturationVapourPressure(p)   ← no compila: Pascal donde se espera Kelvin
""")

M["thermo"] = dict(import_="soarwx/thermo", intro="""
Termodinámica de la parcela. Saturación por Bolton, LCL por Bolton, ascenso seco y
pseudoadiabático por Runge-Kutta adaptativo.

Dos detalles que parecen menores y no lo son. El **LCL usa el calor específico del
aire húmedo**, no el seco: con `cp` seco, a 45 °C y 40 % de humedad, el resultado
se separa un 1.9 % del LCL exacto de Romps (2017); con `cpm`, un 0.5 %. Y el
**calor latente depende de la temperatura**: con `Lv` constante, la θe de referencia
deriva 2.4 K en un ascenso pseudoadiabático de 900 a 500 hPa desde 30 °C; con
`latentHeatOfVaporisation(T)`, 0.5 K.

El integrador **no acepta un paso fuera de tolerancia**. Si no converge, devuelve
error. Un número silenciosamente equivocado es peor que ninguno.
""", example="""
import { lcl, saturationVapourPressure, potentialTemperature, moistAdiabaticLift } from "soarwx/thermo";
import { K, Pa, celsiusToK, hPaToPa } from "soarwx/units";

saturationVapourPressure(K(273.15));       // 611.2 Pa — el valor de manual

const t = celsiusToK(34.6);
const td = celsiusToK(6.8);
const p = hPaToPa(909);

const base = lcl(t, td, p);
base.heightAboveParcelM;                   // 3461 m sobre el punto de partida
base.pressurePa;                           // 60660 Pa

// La regla de Espy que usaba el predecesor daba 3392 m para el mismo caso:
// (34.6 - 6.8) * 122. Con spreads de 28 °C la aproximación ya no vale.

potentialTemperature(t, p);                // 316.3 K — casi 9 K por encima de T
""")

M["sounding"] = dict(import_="soarwx/sounding", intro="""
Ensambla el perfil vertical desde tres fuentes que no encajan solas: la superficie,
los niveles de presión y los niveles de altura fija (10/80/120/180 m).

**Poda los niveles bajo tierra.** En un campo a 1000 m, los de 1000, 975, 950 y a
menudo 925 hPa están por debajo del terreno; ensamblar sin podar produce basura.
La poda es por `geopotential_height`, nunca por `surface_pressure`: las dos series
no son mutuamente consistentes en la respuesta de Open-Meteo.

**Los niveles de altura se anclan a la columna geopotencial del modelo**, no a la
presión de superficie. Anclarlos a `surface_pressure` producía un perfil **no
monótono**: el nivel de 80 m salía a más presión que el de 900 hPa, que está 21 m
por debajo.

El viento se promedia por **componentes**, nunca por grados. La media aritmética de
350° y 10° son 180°, exactamente el rumbo contrario.
""", example="""
import { buildSounding, interpolateAtAgl, findInversions, meanWind, maxGapBelow } from "soarwx/sounding";
import { m } from "soarwx/units";

const built = buildSounding({ site, timeUtc: "2026-08-19T14:00", surface, pressureLevels, heightLevels });
if (!built.ok) throw new Error(built.error.code);
const sounding = built.value;

sounding.quality.levelsDiscardedBelowGround;  // cuántos cayeron bajo el terreno
sounding.quality.maxVerticalGapM;             // el hueco más grande que queda

// Temperatura a 1500 m sobre el campo, interpolando lineal en log-p:
const level = interpolateAtAgl(sounding, m(1500));
if (level.ok) level.value.tempK;

// Inversiones y capas estables en los primeros 5 km, con espesor mínimo de 100 m:
for (const layer of findInversions(sounding)) {
  layer.kind;          // "inversion" | "isothermal" | "stable"
  layer.baseMslM;
  layer.strengthK;
}

// Viento medio de la capa mezclada, promediando componentes U/V y no grados:
const mean = meanWind(
  sounding.levels
    .filter((l) => l.geopotentialMslM < 3000)
    .map((l) => ({ wind: { speedMs: l.windSpeedMs, fromDeg: l.windFromDeg }, weight: 1 })),
);
mean.speedMs;
mean.fromDeg;
""")

M["convection"] = dict(import_="soarwx/convection", intro="""
El núcleo del valor de la librería. La cadena va: radiación → flujo de calor
sensible → `w*` → perfil de ascendencia → `hcrit`.

**El signo del flujo del modelo depende del modelo.** ICON lo sirve positivo hacia
abajo (−243 W/m² a mediodía), GFS positivo hacia arriba (+417 W/m²). `detectFluxSign`
lo deduce correlacionando con la radiación de onda corta, porque tabularlo se
rompe en cuanto Open-Meteo añade un modelo. Usar el valor crudo con ICON da cero
convección todo el día, sin excepción y con un informe de aspecto normal.

**`boundary_layer_height` no es el techo térmico.** ICON no la sirve; en GFS pica a
las 18:00, cuando las térmicas ya han muerto. El método de la parcela es
obligatorio, no una alternativa.

**`w*` usa temperatura potencial**, no absoluta: a 900 hPa son 9 K de diferencia. Y
se anula por encima del corte de viento del perfil de aeronave (12.87 m/s), porque
por encima las térmicas dejan de ser explotables.
""", example="""
import {
  surfaceHeatFlux, convectiveVelocityScale, criticalHeight,
  meanClimbOverBand, detectFluxSign,
} from "soarwx/convection";
import { potentialTemperature } from "soarwx/thermo";
import { GLIDER_CLUB } from "soarwx/aircraft";
import { K, Pa, m, mps, wm2, celsiusToK, hPaToPa } from "soarwx/units";

// 1. Signo del flujo, deducido de la serie del día, no tabulado.
const convention = detectFluxSign(samples);      // "up_positive" | "down_positive"

// 2. Cadena energética completa: Rn -> G -> H -> Qov.
const flux = surfaceHeatFlux({
  shortwaveDownWm2: wm2(894),
  surfaceTempK: celsiusToK(34.6),
  surfaceDewpointK: celsiusToK(6.8),
  surfacePressurePa: hPaToPa(909),
  cloudCoverFrac: 0.04,
  surfaceType: "cropland",
});
flux.netRadiationWm2;    // 617 W/m2
flux.sensibleHeatWm2;    // 346 W/m2   (el predecesor usaba 0.30 * 894 = 268)
flux.source;             // "model" | "energy_balance" — siempre declarado

// 3. Velocidad convectiva de Deardorff.
const w = convectiveVelocityScale({
  virtualHeatFluxKMs: flux.virtualHeatFluxKMs,
  mixingHeightAglM: m(3365),
  surfacePotentialTempK: potentialTemperature(celsiusToK(34.6), hPaToPa(909)),
  surfaceWindMs: mps(2.57),
  profile: GLIDER_CLUB,
});
if (!w.ok) throw new Error(w.error.code);       // NO_CONVECTION es de noche
w.value.wStarMs;          // 3.28 m/s
w.value.suppressedByWind; // true si el viento superó el corte

// 4. Techo práctico: donde el núcleo deja de compensar la caída virando.
const h = criticalHeight(w.value.wStarMs, m(3365), GLIDER_CLUB);
if (h.ok) {
  h.value.hcritAglM;      // 2364 m AGL
  h.value.peakHeightAglM; // 642 m — el máximo está bajo, no a media capa
  h.value.peakClimbMs;    // 2.79 m/s
}

// 5. Lo que marcaría el variómetro, promediado sobre la banda de trabajo.
const climb = meanClimbOverBand(w.value.wStarMs, m(3365), GLIDER_CLUB);
if (climb.ok) climb.value;   // 1.11 m/s
""")

M["clouds"] = dict(import_="soarwx/clouds", intro="""
Base de cumulus, espesor, sobredesarrollo y techo utilizable.

La base **no** es el LCL de la parcela de superficie instantánea: es el nivel de
condensación de la **parcela de capa mezclada**, con la razón de mezcla media de la
capa y la temperatura máxima prevista. Un termómetro a 2 m sobre hierba regada no
describe la columna que sube.

`usableCeiling` es la función que decide el número que mira el piloto, y **declara
por qué es ese**: `hcrit`, la base de nubes, el techo térmico o el cielo cerrado.
Sin el motivo, un techo bajo no dice si el problema es la nube, la térmica o el
sombreado.
""", example="""
import { mixedLayerMean, cumulusBase, cumulusDepth, isBlueDay, usableCeiling, overdevelopmentRisk } from "soarwx/clouds";
import { m } from "soarwx/units";

// Promedios ponderados por masa de la capa mezclada.
const ml = mixedLayerMean(sounding, m(2400));

// La base es el CCL de la parcela de capa mezclada, no el LCL de los 2 m.
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
ceiling.limitedBy;   // "hcrit" — el motivo va con el número, siempre

// Día azul: la capa se acaba antes de que la parcela condense.
cloudBaseAglM === null || isBlueDay(cloudBaseAglM, m(2777));

// Sobredesarrollo como escala ordinal, con los indicadores que lo empujan.
const od = overdevelopmentRisk({
  cumulusDepthM: m(1200),
  midLevelHumidityFrac: 0.55,
  capeBand: "moderate",
  convectiveInhibitionJkg: 20,
  cloudCoverMidFrac: 0.3,
});
od.level;     // "none" | "low" | "moderate" | "high" | "severe"
od.drivers;   // ["depth", "midlevel_moisture", ...] — qué lo está subiendo
""")

M["stability"] = dict(import_="soarwx/stability", intro="""
Índices de estabilidad, todos derivados del **mismo** sondeo y del mismo modelo.

**La CAPE es riesgo, nunca mérito.** No aparece en `FactorId`, solo en `VetoId`.
Puntuarla como buena y a la vez vetarla —el predecesor daba nota máxima a 2400 J/kg
estando a 100 J/kg de disparar su propio veto— es la contradicción que esta
librería existe para corregir.

El **Lifted Index describe la atmósfera por encima de la capa límite**, no dentro
de ella. Una capa mezclada de 3000 m con LI +1.6 es un día excelente. Desde 0.8.0
el veto de estabilidad exige además que el techo se quede corto.
""", example="""
import { liftedIndex, liftedIndexBand, kIndex, totalTotals, capeRisk } from "soarwx/stability";

const li = liftedIndex(sounding, maxSurfaceTempK);
if (li.ok) liftedIndexBand(li.value);      // "stable" | "marginally_unstable" | ...
// li.error.code === "MISSING_VARIABLE" cuando falta el nivel de 500 hPa.
// Nunca devuelve 0.0 por un dato ausente: 0.0 real y ausente son distinguibles.

const risk = capeRisk(2800, 15);   // (CAPE, CIN) — ambos pueden ser null
risk.band;            // "moderate"
risk.stormPotential;  // entra en los vetos, nunca en los factores
risk.inhibited;       // hay CIN suficiente para tapar la convección profunda
risk.capeJkg;         // null si el modelo no la sirvió
""")

M["orographic"] = dict(import_="soarwx/orographic", intro="""
Ladera y onda, **a partir de la geometría real de la cresta**, no de sectores de
rumbo escritos a mano.

El predecesor llevaba un 310° incrustado para «el Guadarrama». La normal real de La
Mujer Muerta es 338°: 28° de error, que cuestan cos 28° = 0.887 de la componente
perpendicular. Aquí la cresta entra como `RidgeSpec` y el consumidor la aporta.

La onda se juzga por el **parámetro de Scorer** (`l² = N²/U² − U″/U`) calculado
sobre el sondeo. El heurístico de sector y umbral existe como respaldo, y cuando se
usa queda declarado en `method`.
""", example="""
import { ridgeLift, scorerParameter, wavePotential } from "soarwx/orographic";
import { deg, m, mps } from "soarwx/units";

const mujerMuerta = { name: "La Mujer Muerta", bearingDeg: deg(68), slopeDeg: deg(16), crestMslM: m(2197) };

const lift = ridgeLift(mujerMuerta, { speedMs: mps(9), fromDeg: deg(340) });
lift.perpendicularMs;  // componente del viento perpendicular a la cresta
lift.verticalMs;       // U_perp * sin(pendiente)
lift.incidenceDeg;     // 0 = de frente
lift.band;             // "insufficient" | "marginal" | "optimal" | "dangerous"

const wave = wavePotential(sounding, mujerMuerta);
if (wave.ok) {
  wave.value.potential;         // "none" | "marginal" | "likely" | "strong"
  wave.value.method;            // "scorer" o "heuristic": nunca se oculta cuál se usó
  wave.value.trappedLeeWave;
  wave.value.estimatedWavelengthM;
}
""")

M["aircraft"] = dict(import_="soarwx/aircraft", intro="""
El perfil de aeronave, que lleva dos números distintos y conviene no confundirlos.

`hcritThresholdMs` es el **criterio**: los 225 fpm (1.143 m/s) con los que DrJack
declara que la térmica deja de ser explotable. Vale lo mismo en todo el catálogo,
porque es una convención de RASP y no una propiedad del avión. Cambiar de perfil
**no mueve `hcrit`**, y eso es deliberado: es lo que mantiene el techo comparable
con lo que publica RASP.

`circlingSinkMs` es el **hundimiento real** virando a 40°, y sí depende del modelo.
No se declara a mano: sale del mínimo hundimiento en recto que publica el
fabricante, multiplicado por `BANK_40_SINK_FACTOR`. En viraje coordinado el factor
de carga es `n = 1/cos φ`, y para una polar parabólica volando a la velocidad
óptima del nuevo factor de carga la velocidad sube `n^(1/2)` y el hundimiento
`n^(3/2)`. A 40°, eso es +14 % y +49 %. Un ASK 21 pasa así de 0.65 a 0.97 m/s:
por debajo de los 225 fpm, que era el aviso.

`RASP_REFERENCE` iguala los dos campos y reproduce exactamente lo que publica
RASP, para contrastar.

El corte de viento, 12.87 m/s, es común a todos los perfiles: actúa sobre `w*`, así
que es meteorología y no aeronave. Ese 12.87 es el número que usa Allen en sus
cálculos aunque su texto diga «25 nudos»; los 25 nudos exactos están aparte, en
`ALLEN_WIND_CUTOFF_EXACT_KNOTS_MS`, y la diferencia queda anotada en vez de
disimulada.

Aviso sobre la tabla de modelos: cada fabricante publica su mínimo hundimiento a la
masa que le conviene, así que las cifras no son estrictamente comparables entre sí.
El manual del Astir CS lo enseña en una sola tabla: 0.6 m/s a 350 kg y 0.7 m/s a
450 kg.
""", example="""
import { GLIDER_CLUB, ASH_25, RASP_REFERENCE, AIRCRAFT_PROFILES, findAircraftProfile } from "soarwx/aircraft";
import { criticalHeight, expectedVarioAt } from "soarwx/convection";

// El techo no depende del velero: lo fija el criterio de los 225 fpm.
criticalHeight(wStarMs, ziAglM, GLIDER_CLUB);       // 2364 m AGL
criticalHeight(wStarMs, ziAglM, ASH_25);            // los mismos 2364 m AGL

// Lo que sí depende del velero es lo que marca el variómetro.
expectedVarioAt(wStarMs, ziAglM, ziAglM, ASH_25);   // más que con GLIDER_CLUB

// Con la referencia de RASP, el variómetro cae a cero justo en hcrit.
RASP_REFERENCE.circlingSinkMs === RASP_REFERENCE.hcritThresholdMs;

findAircraftProfile("duo-discus");                  // uno del catálogo
AIRCRAFT_PROFILES.length;                           // 12
""")

M["forecast"] = dict(import_="soarwx/forecast", intro="""
Cómo se convierten los números en un veredicto, con el desglose a la vista.

**Los factores puntúan por bandas** y cada uno devuelve su valor, su puntuación, su
peso y si pasa. **Los vetos topan, no restan**: un cielo cerrado no quita medio
punto, impide pasar de nivel 1 por bien que puntúe el resto. Y **ningún factor
premia lo que un veto castiga**, que es la regla que mantiene fuera a la CAPE.

La mejor hora se ordena por techo utilizable y nivel tras vetos, nunca por cuántos
factores salieron en verde.
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
  liftedIndex: 1.5,          // positivo, pero la capa da de sí: NO veta
  cape: capeRisk(800),
  kIndex: 18,
  surfaceWindMs: 4,
});

const score = aggregate(factors, vetoes);
score.level;              // 1..5 tras aplicar los topes
score.levelBeforeVetoes;  // el nivel que habría sacado sin ellos
score.factors;            // cada uno con valor, puntuación, peso y banda
score.limitingFactors;    // los que puntúan por debajo de 0.6, peor primero

// Ventanas de al menos dos horas seguidas por encima de nivel 3:
const windows = findWindows(hours, 3);

// Confianza como dispersión entre modelos, no como un número inventado:
const confidence = confidenceFrom([
  { model: "icon_eu", ceilingAglM: m(2364), wStarMs: mps(3.28) },
  { model: "gfs_seamless", ceilingAglM: m(2537), wStarMs: mps(3.11) },
]);
confidence?.level;             // "low" | "medium" | "high"
confidence?.ceilingSpreadM;    // 173
confidence?.modelsUsed;        // null entero si solo hubo un modelo
""")

M["report"] = dict(import_="soarwx/report", intro="""
`computeDay` es la costura de la librería: **todo lo que está por encima de ella se
prueba sin red y sin reloj**. Recibe observaciones horarias ya en SI y devuelve el
día completo — horas puntuadas, ventanas, mejor momento, atribución.

Es pura y determinista. La misma entrada da la misma salida byte a byte, y hay una
prueba que ejecuta cien veces para comprobarlo.

Cada `SoaringHour` lleva su `sounding` dentro, para que el consumidor pueda dibujar
el diagrama oblicuo de esa hora sin volver a pedir nada.
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
  profile: GLIDER_CLUB,         // opcional
});
if (!result.ok) throw new Error(result.error.code);

const day: SoaringDay = result.value;
day.best;            // SoaringHour | null — null es un día sin ventana, no un fallo
day.windows;         // tramos continuos volables
day.attribution;     // hay que mostrarlo: Open-Meteo es CC BY 4.0
day.confidence;      // null con un solo modelo, no un valor fingido

for (const hour of day.hours as readonly SoaringHour[]) {
  hour.thermal.wStarMs;
  hour.thermal.meanClimbMs;
  hour.ceiling.aglM;
  hour.ceiling.limitedBy;
  hour.cloud.blue;
  hour.quality.heatFluxSource;      // "model" o "energy_balance"
  hour.quality.pressureLevelsUsed;  // cuántos niveles sobrevivieron a la poda
}
""")

M["openmeteo"] = dict(import_="soarwx/openmeteo", intro="""
**El único módulo que hace peticiones.** Todo lo demás es puro.

`fetch` es inyectable: las pruebas sirven fixtures y el mismo código corre en
navegador y en Node. La petición va por POST con campos repetidos, porque con ocho
niveles de presión la URL de GET se pasa de largo y unir las variables por comas en
POST devuelve 400.

Trampas que este módulo encapsula, todas verificadas contra la API en vivo y no
leídas de la documentación:

- **Un nombre de variable desconocido devuelve 400 y tumba la petición entera**, no
  solo esa variable. Una variable conocida que el modelo no tiene devuelve un array
  de `null` sin error. Se detecta por contenido, nunca por presencia de la clave.
- **`hourly_units` puede llegar con la cadena literal `"undefined"`.**
- **`models=best_match` cose modelos distintos** a lo largo del horizonte: la serie
  deja de ser físicamente coherente y la dispersión entre modelos deja de
  significar nada. Está prohibido.
- Se envían siempre `elevation`, la zona horaria del emplazamiento y
  `wind_speed_unit=ms`.
""", example="""
import { fetchSoaringDay, memoryCache, MODEL_CAPABILITIES, soundingModels } from "soarwx/openmeteo";
import { GLIDER_CLUB } from "soarwx/aircraft";

// Varios modelos + confianza por dispersión, en una llamada:
const result = await fetchSoaringDay(site, "2026-08-19", {
  models: ["icon_eu", "gfs_seamless"],
  profile: GLIDER_CLUB,
  timeoutMs: 8000,
  retries: 2,
  cache: memoryCache(),
});
if (result.ok) {
  result.value.day;       // SoaringDay ya calculado
  result.value.failed;    // modelos que no respondieron: fallo parcial, no total
}

// En pruebas, sin red: se inyecta el fetch.
await fetchSoaringDay(site, "2026-08-19", {
  fetch: async () => new Response(JSON.stringify(fixture), { status: 200 }),
});

// Qué sirve cada modelo, verificado en vivo y no copiado de la documentación:
MODEL_CAPABILITIES.icon_eu.hasBoundaryLayerHeight;   // false — ICON no la sirve
MODEL_CAPABILITIES.icon_eu.hasLiftedIndex;           // false — se calcula del sondeo
MODEL_CAPABILITIES.icon_eu.pressureLevelsHpa;        // los que existen de verdad
soundingModels();                                    // los que sirven perfil vertical
""")

M["render"] = dict(import_="soarwx/render", intro="""
Generadores de **cadenas SVG**. Cero dependencias, cero framework, cero JavaScript
enviado al cliente. El consumidor inserta la cadena donde quiera.

Los colores salen de variables CSS (`--chart-1..5`) con respaldo literal, así que
funcionan en claro y en oscuro sin recalcular nada. Todo lleva `<title>` y `<desc>`,
y el texto insertado se escapa.

El escalado del panel de viento elige el paso **en la unidad que rotula**: pedir
km/h y calcular el paso en m/s da etiquetas como 9, 18, 27.
""", example="""
import { renderSkewT, renderUpdraftProfile, renderDayTimeline } from "soarwx/render";
import { GLIDER_CLUB } from "soarwx/aircraft";
import { m } from "soarwx/units";

const best = day.best!;

// Diagrama oblicuo con la parcela, el techo y el panel de viento a la derecha.
const skewt = renderSkewT(best.sounding, {
  parcelFromK: best.sounding.surface.tempK,
  ceilingMslM: m(site.elevationMslM + best.ceiling.aglM),
  windUnit: "kmh",
  // `exactOptionalPropertyTypes` está activo: una opción ausente se omite,
  // no se pasa como `undefined`.
  ...(best.cloud.baseAglM === null ? {} : { lclMslM: m(site.elevationMslM + best.cloud.baseAglM) }),
});

// Ascendencia frente a altura: el núcleo y lo que marcaría el variómetro.
const profile = renderUpdraftProfile(best.thermal.wStarMs, best.thermal.thermalTopAglM, GLIDER_CLUB, {
  marks: {
    hcritAglM: best.ceiling.aglM,
    ...(best.cloud.baseAglM === null ? {} : { cloudBaseAglM: best.cloud.baseAglM }),
  },
});

// Evolución del techo a lo largo del día, con la ventana y el mejor momento.
const timeline = renderDayTimeline(day);

container.innerHTML = skewt;   // son cadenas, no nodos
void [profile, timeline];
""")

M["i18n/es"] = dict(import_="soarwx/i18n/es", intro="""
El **único** módulo con prosa. El núcleo devuelve enums y números; aquí se
traducen. Ninguna función de física importa este módulo, y hay una prueba que
recorre `src/` para exigirlo.

El predecesor devolvía marcado de Rich dentro de los valores —`"[green]Bajo[/green]"`—
y luego necesitaba una función para limpiarlo. Por eso el veredicto no lleva texto.

`formatHour` y `formatInstant` usan la zona del emplazamiento, no la del navegador:
un usuario en Berlín consultando Fuentemilanos tiene que ver la hora local del
aeródromo.

Todas las `describe*` tienen la misma forma —enum de entrada, cadena de salida— y
son exhaustivas: una prueba recorre cada enum del contrato y exige traducción para
cada valor, así que no puede quedarse ninguno sin texto al añadir uno nuevo.
""", example="""
import * as es from "soarwx/i18n/es";

es.describeLevel(4);                       // el nivel, en palabras
es.describeCeilingLimit("hcrit");          // por qué el techo es ese
es.describeVeto("stable_atmosphere");      // "Atmósfera estable sobre una capa convectiva corta"
es.describeThermalQuality("organised");
es.describeConfidence("medium");

es.formatHour("2026-08-19T14:00", site.timezone);      // "16:00" en verano
es.formatInstant("2026-08-19T14:00", site.timezone);   // con día y mes

es.DISCLAIMER;   // no sustituye al briefing oficial ni a la decisión del piloto
""")

out = {k: {"import": v["import_"], "intro": v["intro"], "example": v["example"]} for k, v in M.items()}
(HERE / "prose.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("módulos:", len(out))
