import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tools/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Type-only files and re-export barrels: they contain no logic to cover,
      // and including them skews the average of modules that do.
      exclude: ["src/**/types.ts", "src/types/site.ts", "src/**/index.ts"],
      reporter: ["text", "lcov"],
      // Thresholds from docs/ACCEPTANCE.md §2. Raised per directory as each
      // module gains implementation; those remaining at 0 are empty barrels.
      thresholds: {
        "src/units/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/thermo/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/sounding/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/convection/**": { lines: 90, branches: 85, functions: 90, statements: 90 },
        "src/aircraft/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/clouds/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/stability/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/orographic/**": { lines: 90, branches: 85, functions: 90, statements: 90 },
        "src/forecast/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/report/**": { lines: 85, branches: 80, functions: 90, statements: 85 },
        "src/openmeteo/**": { lines: 85, branches: 80, functions: 85, statements: 85 },
        "src/render/**": { lines: 90, branches: 80, functions: 90, statements: 90 },
        "src/i18n/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/types/**": { lines: 50, branches: 50, functions: 50, statements: 50 },
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
      },
    },
  },
});
