## What this changes

<!-- And why. Link the issue if there is one. -->

## Checklist

- [ ] `pnpm check` passes locally (CI does not run `docs:examples`; the local gate does)
- [ ] New or changed formulas carry `@source`: author, year, equation number
- [ ] Numeric properties carry their unit suffix, and values are branded types
- [ ] Tests keep their acceptance-ID comments, and no test outside the `@network` suite
      touches the network
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`

## Does this move a number the pilot reads?

<!--
A change to a formula or a physical constant is a breaking change even when no signature
moves. If it moves a number, give the derivation here and put it in the changelog entry.
If it does not, say "no".
-->
