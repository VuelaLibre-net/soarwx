import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OPEN_METEO_ATTRIBUTION, SOARWX_VERSION } from "../src/index.js";

describe("package", () => {
  it("exposes the version", () => {
    expect(SOARWX_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // Must not lag behind package.json: saved results are interpreted
    // using the formula version that produced them.
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SOARWX_VERSION).toBe(pkg.version);
  });

  // G-16 in docs/ACCEPTANCE.md
  it("attribution names Open-Meteo and CC BY 4.0", () => {
    expect(OPEN_METEO_ATTRIBUTION).toContain("Open-Meteo");
    expect(OPEN_METEO_ATTRIBUTION).toContain("CC BY 4.0");
  });
});
