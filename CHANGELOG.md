# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with one
project-specific rule: **a change to a formula or to a physical constant is a breaking
change**, even when no signature moves, because the number the pilot reads changes. While
the API is unstable (0.x) those land as a minor bump, and the entry carries the derivation,
not just the delta.

## [Unreleased]

## [0.12.0] - 2026-08-26

### Added

- English locale module (`soarwx/i18n/en`) with pilot-oriented wording, alongside the
  existing `soarwx/i18n/es`. Both are pure enum-to-text maps: the core keeps returning
  numbers and enums, and no markup ever crosses the boundary.
- Unit test suite for the English locale (`test/i18n/en.test.ts`), and coverage for
  `findAircraftProfile`.

### Changed

- Documentation, docblocks, tooling and test names translated to English. The Spanish
  pilot-facing strings live only in `src/i18n/es.ts`.
- Packaging for the npm registry: `keywords`, `author` and `publishConfig.access` added,
  and `./package.json` exported so tooling can resolve the manifest.
- `engines.node` relaxed from `>=22.13.0` to `>=20.11.0`. The old floor described the
  toolchain (`node --experimental-strip-types`, pnpm 11), not the published bundle: `dist`
  is ES2023 with no Node API, so it runs on Node 20 LTS and in the browser. The previous
  value rejected Node 20 consumers with `EBADENGINE` for no reason. Development still
  wants Node 22.13+.
- Published tarball reduced from 1.1 MB to ~130 kB (2.8 MB to 473 kB unpacked). `files`
  now ships `dist`, the README, this changelog and `docs/API.md`; the `docs/diagrams/`
  visual-check artefacts are development output and stay out. `tsup` no longer emits
  sourcemaps — they embedded `sourcesContent`, which shipped the whole of `src/` twice.
- `.github/workflows/release.yml` publishes to npm with provenance on a `v*` tag, running
  the full `pnpm check` gate first.

## [0.11.0] - 2026-08-26

Initial development release: the complete rewrite of the `open-meteo-soar` Python CLI as a
pure TypeScript library. The predecessor mixed physics, HTTP and terminal markup inside the
same functions; here the physics core is pure and the network lives in a single leaf module.

### Added

- `units/` branded types (`Kelvin`, `Pascal`, `Metres`, `MPerS`), constants and conversions.
  SI internally, with a unit suffix on every numeric property.
- `thermo/`, `sounding/`, `convection/`, `clouds/`, `stability/` and `orographic/`: the
  physics core. Every exported formula cites its source (author, year, equation), enforced
  by the `soarwx/require-source-citation` lint rule.
- `forecast/` factors, vetoes, score, bands, windows and confidence, and `report.computeDay`
  — the pure seam, testable from fixtures with no network.
- `openmeteo/`, the only module that touches the network, with the sign detection for
  `sensible_heat_flux` that the model convention makes mandatory, below-ground pressure
  level pruning, and content-based detection of variables served as `null`.
- `render/` dependency-free SVG generators and `i18n/es` Spanish texts.

### Fixed

- **CAPE is a risk, never a positive factor.** The predecessor scored CAPE in the verdict
  while a veto punished the same value, so a day could be promoted and demoted by one
  number. CAPE now appears only in `VetoId`.
- **`hcrit` no longer moves when the aircraft changes.** The predecessor had one field
  where there are two numbers: `hcritThresholdMs` is DrJack's criterion for when thermals
  stop being usable (225 fpm, identical across the whole catalogue, read by
  `criticalHeight`), while `circlingSinkMs` is the aircraft's real sink rate circling at
  40°, taken from the published polar and read by `expectedVarioAt`. Conflating them made
  the ceiling depend on the glider and stop being comparable with RASP.
- **Missing is not zero.** A missing `lifted_index` returns `MISSING_VARIABLE` instead of
  `0.0`; every fallback is declared in `quality.estimated`, and the same missing datum
  produces the same substitution on every code path.
- **The thermal top comes from the parcel method**, not from `boundary_layer_height`: ICON
  does not serve that variable, and in GFS it peaks at 18:00 local, after thermals have died.

[Unreleased]: https://github.com/VuelaLibre-net/soarwx/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/VuelaLibre-net/soarwx/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/VuelaLibre-net/soarwx/releases/tag/v0.11.0
