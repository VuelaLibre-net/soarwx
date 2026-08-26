# Contributing to soarwx

Thanks for taking the time. This library computes numbers a pilot uses to decide whether to
fly, so the rules below are stricter than they look for a package this size. They are all
enforced mechanically — none of them are matters of taste.

## Getting set up

```bash
pnpm install
pnpm check    # the full gate; run it before opening a pull request
```

Development requires Node 22.13+ (the docs gate runs `node --experimental-strip-types`) and
the pnpm version pinned in `packageManager`. The **published** bundle only needs Node 20.11+
or a modern browser — see `engines.node`.

## The gate

`pnpm check` runs, in order: `format:check`, `lint`, `docs:examples`, `typecheck`, `test`,
`build`, `size`. CI runs the same links except `docs:examples`, and swaps `test` for
`test:coverage`, so run the local gate before declaring anything done.

| Command | What it checks |
| --- | --- |
| `pnpm test` | vitest, excludes `*.network.test.ts`. `pnpm test <path>` for one file, `pnpm test -t "<name>"` for one test |
| `pnpm test:coverage` | the per-directory thresholds in `vitest.config.ts` (85-90 %). The global threshold is deliberately 0; the per-directory ones are what gate |
| `pnpm test:network` | the contract suite against the live Open-Meteo API. Not in CI: it runs on a weekly cron, and a failure opens an issue instead of blocking the build |
| `pnpm lint` | eslint, 0 errors and 0 warnings, including two project-specific rules |
| `pnpm size` | `size-limit` against the budgets in `package.json` |
| `pnpm docs:api` | regenerates `docs/API.md` from the built `.d.ts` (needs `python3`) |

A red link is your change. Do not loosen a threshold, disable a rule or edit a golden value
to get to green.

## Invariants

These are the rules a plausible-looking change breaks silently. Four are enforced by
`eslint.config.js`.

- **SI internally, unit suffix on every numeric property** — `tempK`, `zAglM`, `wStarMs`,
  `capeJkg`. A property named `alt` or `temp` fails review. Altitudes are `AglM` or `MslM`,
  never bare. Enforced by `soarwx/unit-suffix` across `src/`; the single exemption is
  `src/openmeteo/types.ts`, which mirrors Open-Meteo's own JSON names and is converted in
  `normalize.ts`.
- **Branded types, not `number`** — build values with `K()`, `Pa()`, `m()`, `mps()`,
  `deg()`, `wm2()` from `src/units/branded.ts`. `as any` and non-null assertions are banned
  in `src/`.
- **Every exported formula carries `@source`** — author, year, equation number. Enforced by
  `soarwx/require-source-citation` in `thermo/`, `convection/`, `clouds/`, `stability/` and
  `orographic/`. Uncited formulas do not merge.
- **`src/` must run in a browser** — `node:*`, `fs`, `path`, `url` and `crypto` are blocked
  everywhere in `src/`. Node APIs belong in `test/` and `tools/`.
- **Only `src/openmeteo/` may touch the network** — `fetch` and `XMLHttpRequest` are banned
  as globals in every other directory.
- **The core returns numbers and enums, never text or markup** — Spanish and English strings
  live in `src/i18n/`. `test/i18n/purity.test.ts` walks the whole `SoaringDay` tree and fails
  on any string that is not an enum, a timestamp or consumer-supplied site data.
- **No hardcoded sites** — terrain enters as `RidgeSpec` data. Site names may appear in
  docblocks to document where a measurement came from, never in code. Reference sites live
  in `test/helpers/sites.ts`.
- **Missing is not zero** — a missing variable returns `MISSING_VARIABLE`. Fallbacks are
  declared in `quality.estimated`, and the same missing datum produces the same substitution
  on every code path.
- **No swallowed exceptions** — expected conditions return `Result<T, SoarwxError>` with a
  stable `code`. Throwing is for programmer error only. `NO_CONVECTION` is a valid state
  (it is night), not a failure.
- **CAPE is risk only** — it belongs in `VetoId`, never in `FactorId`.

## Tests

Tests never touch the network except the `@network` contract suite. `fetch` is injected and
served from `test/fixtures/openmeteo/`, which holds real captures for ICON and GFS plus the
error cases; load them through `test/helpers/fixture.ts`.

Golden values are computed, not estimated, and the generating scripts in `test/golden/` re-run
in CI. If a golden value changes, decide whether the code or the reference is wrong — never
update the number to make the test pass. The reference implementations in `test/golden/`
(`romps.ts`, `goffGratch.ts`, `thetaE.ts`, `lambertW.ts`) are test-only and must never be
imported from `src/`.

Tests are keyed to acceptance IDs in comments (`// O-01`, `// I-02`). Keep the comment when
you touch one.

## Adding a public export

A new subpath needs three edits in lockstep or the build silently omits it:

1. `exports` in `package.json`
2. `entry` in `tsup.config.ts`
3. a `size-limit` budget in `package.json`

Then run `pnpm docs:api` to regenerate the reference, and add a coverage threshold for the
new directory in `vitest.config.ts`.

## Commits and pull requests

Code, identifiers, comments and commit messages are in English. Commit messages follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
`test:`, `refactor:`, `chore:`, `ci:`, `release:`, with an optional scope
(`test(i18n): ...`).

A change to a formula or a physical constant is a breaking change even when no signature
moves, because the number the pilot reads changes. Say so in the pull request and add a
`CHANGELOG.md` entry under `## [Unreleased]` carrying the **derivation**, not just the delta.

## Releasing

Maintainers only. Bump the version, move the `## [Unreleased]` entries under the new heading
with its date and compare link, then push a `v*` tag: `.github/workflows/release.yml` runs
the full gate and publishes to npm with provenance.
