import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tools/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Ficheros de solo tipos y barriles de reexportación: no tienen lógica
      // que cubrir, y contarlos falsea la media de los módulos que sí la tienen.
      exclude: ["src/**/types.ts", "src/types/site.ts", "src/**/index.ts"],
      reporter: ["text", "lcov"],
      // Umbrales de docs/ACCEPTANCE.md §2. Se suben por directorio conforme
      // cada módulo gana implementación; los que siguen a 0 son barriles vacíos.
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
