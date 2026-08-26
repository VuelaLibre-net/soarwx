# API — referencia de `soarwx`

**Versión 0.8.0.** La API es inestable hasta la 1.0.0.

`SPEC.md` define el contrato y qué queda fuera de él. Este documento lista **todo
lo que el paquete exporta**, con la firma real y un ejemplo por módulo. Las tablas
se generan desde los `.d.ts` publicados: si una firma cambia, este documento
cambia con ella.

## Cómo leer esta referencia

**Todo es SI, y el nombre lo dice.** `tempK`, `pressurePa`, `zAglM`, `wStarMs`,
`capeJkg`. Una propiedad que se llame `alt` o `temp` no existe. Las alturas son
`AglM` (sobre el terreno) o `MslM` (sobre el nivel del mar), nunca a secas. Las
conversiones a nudos, pies o km/h viven en `soarwx/units` y son para la
presentación, no para el cálculo.

**Los tipos van marcados.** `Kelvin` no es `number`: es `number & { [brand]: "K" }`.
Pasar pascales donde se esperan kelvin no compila. Para construir un valor marcado
se usan los constructores cortos: `K(300)`, `Pa(90900)`, `m(1500)`, `mps(3.2)`.

**Lo esperable devuelve `Result`, no lanza.** Una noche sin convección, un sondeo
sin niveles altos o una variable que el modelo no sirve son estados válidos, no
fallos. Se devuelven como `{ ok: false, error }` con un `code` estable. Solo lo
imposible —un argumento fuera de dominio— lanza.

**El núcleo no toca la red y no devuelve texto.** Todo devuelve números y enums.
Las cadenas en español están en `soarwx/i18n/es`, y la única función que hace
peticiones está en `soarwx/openmeteo`.

## Instalación

```bash
pnpm add soarwx
```

ESM puro, `sideEffects: false`, catorce puntos de entrada con `types` propios:

| Import | Qué trae |
|---|---|
| `soarwx` | `Result`, `Site`, `RidgeSpec`, atribución, versión |
| `soarwx/units` | Tipos marcados, constantes físicas, conversiones |
| `soarwx/thermo` | Saturación, LCL, ascenso de parcela, θ y θe |
| `soarwx/sounding` | Ensamblado del perfil, interpolación, inversiones, viento |
| `soarwx/convection` | Flujo de calor, `w*`, perfil de ascendencia, `hcrit`, disparo |
| `soarwx/clouds` | Capa mezclada, base de cumulus, sobredesarrollo, techo |
| `soarwx/stability` | LI, KI, Total Totals, CAPE como riesgo |
| `soarwx/orographic` | Ladera, parámetro de Scorer, onda |
| `soarwx/aircraft` | `AircraftProfile` y el preajuste `GLIDER_CLUB` |
| `soarwx/forecast` | Factores, vetos, índice, ventanas, confianza |
| `soarwx/report` | `computeDay`: el día completo, puro |
| `soarwx/openmeteo` | **El único módulo con red** |
| `soarwx/render` | Generadores de SVG, sin dependencias |
| `soarwx/i18n/es` | Enum → texto en español |

## El camino corto

Una previsión completa desde el navegador, con dos modelos y medida de confianza:

```ts
import { fetchSoaringDay } from "soarwx/openmeteo";
import { GLIDER_CLUB } from "soarwx/aircraft";
import * as es from "soarwx/i18n/es";
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
  console.log(`${es.describeLevel(best.score.level)} a las ${es.formatHour(best.timeUtc, fuentemilanos.timezone)}`);
  console.log(`techo ${Math.round(best.ceiling.aglM)} m AGL, ${es.describeCeilingLimit(best.ceiling.limitedBy)}`);
  for (const veto of best.score.vetoes) console.log("⚠", es.describeVeto(veto.id));
}
console.log(day.attribution);   // obligatorio mostrarlo: CC BY 4.0
```

## El camino largo

`fetchSoaringDay` es azúcar sobre dos piezas separables. Si ya tienes los datos
—de una caché, de un fixture, de otro proveedor— salta la red y llama a
`computeDay`, que es puro:

```ts
import { computeDay } from "soarwx/report";
import { renderSkewT } from "soarwx/render";
import { m } from "soarwx/units";

const day = computeDay({
  site: fuentemilanos,
  hourly,                       // HourlyObservation[], ya en SI
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

Esa separación es el motivo de que la librería exista: todo lo que está por encima
de `computeDay` se prueba desde fixtures, sin red y sin reloj.

## Errores

Cada `SoarwxError` lleva un `code` estable —el `message` es inglés para registros
y puede cambiar— y un `detail` opcional con los valores que lo provocaron.

```ts
import { isErr } from "soarwx";
import { criticalHeight } from "soarwx/convection";
import { GLIDER_CLUB } from "soarwx/aircraft";

const climb = criticalHeight(wStarMs, ziAglM, GLIDER_CLUB);
if (isErr(climb)) {
  if (climb.error.code === "NO_CONVECTION") return "es de noche";  // estado válido
  throw new Error(climb.error.code);
}
```

`NO_CONVECTION` no es un fallo: es que no hay térmicas. `MISSING_VARIABLE` significa
que el modelo no sirvió el dato, y **nunca** se sustituye por cero en silencio: la
sustitución, si la hay, queda declarada en `quality.estimated`.
