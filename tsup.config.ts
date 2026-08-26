import { defineConfig } from "tsup";

/** One entry point per subpath in the package.json `exports` map. */
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/units/index.ts",
    "src/thermo/index.ts",
    "src/sounding/index.ts",
    "src/convection/index.ts",
    "src/aircraft/index.ts",
    "src/clouds/index.ts",
    "src/stability/index.ts",
    "src/orographic/index.ts",
    "src/forecast/index.ts",
    "src/report/index.ts",
    "src/openmeteo/index.ts",
    "src/render/index.ts",
    "src/i18n/es.ts",
    "src/i18n/en.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2023",
});
