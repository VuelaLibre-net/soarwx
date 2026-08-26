# soarwx

Soaring weather conditions derived from numerical models via
[Open-Meteo](https://open-meteo.com): usable thermal ceiling, climb strength,
critical height, cumulus base, overdevelopment risk and thermal quality against
shear — what a pilot needs that the raw model doesn't give you.

> Status: 0.12.0. Unstable API until 1.0.0.

```bash
pnpm add soarwx
```

TypeScript, pure ESM, no runtime dependencies. The core never touches the network.

## Usage

```ts
import { fetchSoaringDay } from "soarwx/openmeteo";
import { GLIDER_CLUB } from "soarwx/aircraft";
import * as en from "soarwx/i18n/en";
import { m } from "soarwx/units";

const result = await fetchSoaringDay(
  {
    name: "Fuentemilanos",
    icao: "LEFM",
    latDeg: 40.9167,
    lonDeg: -4.2333,
    elevationMslM: m(1013),
    timezone: "Europe/Madrid",
    surface: { type: "cropland" },
  },
  "2026-08-19",
  { models: ["icon_eu", "gfs_seamless"], profile: GLIDER_CLUB },
);

if (result.ok && result.value.day.best !== null) {
  const best = result.value.day.best;
  console.log(en.describeLevel(best.score.level)); // verdict for the best window
  console.log(Math.round(best.ceiling.aglM), "m AGL"); // usable ceiling
  console.log(en.describeCeilingLimit(best.ceiling.limitedBy)); // and why
  console.log(result.value.day.attribution); // must be displayed
}
```

`computeDay` is the heart of this library: pure, no network. If you already have
sounding data, skip `soarwx/openmeteo` entirely. Each module has a worked example
in [`docs/API.md`](docs/API.md).

## Documentation

| Document | Contents |
|---|---|
| [`docs/API.md`](docs/API.md) | Reference for every exported symbol, with signatures and examples |
| [`docs/SPEC.md`](docs/SPEC.md) | Public contract: types, units, errors |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Functional scope and traceability |
| [`docs/OPEN_METEO_INTEGRATION.md`](docs/OPEN_METEO_INTEGRATION.md) | Open-Meteo variables, models and verified traps |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | Acceptance criteria and golden values |
| [`docs/REFERENCES.md`](docs/REFERENCES.md) | Primary sources |

## Principles

Pure core with no network access — the physics layer has no idea Open-Meteo
exists. SI internally, with a unit suffix on every property and conversion only
at the edges. Every formula carries its citation, or it doesn't get in. Values
and diagnostics stay separate: the core returns numbers and enums, text lives in
`i18n/`. No hardcoded sites — terrain enters as data. And a fallback is always
declared; an estimated value is never presented as measured.

## Development

```bash
pnpm check   # format, lint, types, tests, build and size — the full gate
pnpm test    # vitest, no network
```

## Attribution

Weather data comes from [Open-Meteo.com](https://open-meteo.com), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The free tier **does not allow commercial use**.

## Disclaimer

This library produces an **advisory forecast**. It does not replace an official weather
briefing or the pilot in command's judgment.
