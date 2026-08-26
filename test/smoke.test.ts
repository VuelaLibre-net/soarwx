import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OPEN_METEO_ATTRIBUTION, SOARWX_VERSION } from "../src/index.js";

describe("paquete", () => {
  it("expone la versión", () => {
    expect(SOARWX_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // No puede quedarse atrás de package.json: los resultados guardados se
    // interpretan con la versión de las fórmulas que los produjo.
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SOARWX_VERSION).toBe(pkg.version);
  });

  // G-16 de docs/ACCEPTANCE.md
  it("la atribución nombra Open-Meteo y CC BY 4.0", () => {
    expect(OPEN_METEO_ATTRIBUTION).toContain("Open-Meteo");
    expect(OPEN_METEO_ATTRIBUTION).toContain("CC BY 4.0");
  });
});
