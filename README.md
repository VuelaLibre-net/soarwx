# soarwx
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-pure%20ESM-3178c6.svg)](tsconfig.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen.svg)](package.json)

Soaring weather conditions derived from numerical models via
[Open-Meteo](https://open-meteo.com): usable thermal ceiling, climb strength,
critical height, cumulus base, overdevelopment risk and thermal quality against
shear — what a pilot needs that the raw model doesn't give you.

> Status: 0.12.0. Unstable API until 1.0.0.

```bash
pnpm add soarwx
```

TypeScript, pure ESM, no runtime dependencies. The core never touches the network.

Requires Node 20.11+ or any modern browser. The package is **ESM only** — there is no
CommonJS build, so a `require()` consumer needs `await import("soarwx")`. Bundlers and
`"type": "module"` projects need nothing special.

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

- **[`docs/API.md`](docs/API.md)** — Complete API reference for every exported symbol across all 15 modules, with TypeScript signatures, parameter descriptions, and verified examples.
- **[`docs/diagrams/soarwx-architecture.html`](docs/diagrams/soarwx-architecture.html)** — Interactive architecture and data flow diagram.

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

Development needs Node 22.13+ and the pinned pnpm. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the gate, the invariants it enforces and how to add
a public export, [`CHANGELOG.md`](CHANGELOG.md) for what moved between versions, and
[`SECURITY.md`](SECURITY.md) to report a vulnerability.

## Attribution

Weather data comes from [Open-Meteo.com](https://open-meteo.com), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The free tier **does not allow commercial use**.

## Disclaimer

This library produces an **advisory forecast**. It does not replace an official weather
briefing or the pilot in command's judgment.
