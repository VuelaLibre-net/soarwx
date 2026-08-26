import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { computeDay } from "../../src/report/assemble.js";
import { loadFixture, toHourlyObservations } from "../helpers/fixture.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";

const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
const result = computeDay({
  site: FUENTEMILANOS_SITE,
  hourly: toHourlyObservations(fixture, FUENTEMILANOS_SITE, "down_positive"),
  dateLocal: "2026-08-18",
  sunriseUtc: "2026-08-18T05:30",
  sunsetUtc: "2026-08-18T19:11",
});
if (!result.ok) throw new Error(result.error.message);

/** Recursively collects all strings from object tree with their property path. */
function stringsIn(value: unknown, path = "", out: [string, string][] = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value))
    value.forEach((item, index) => stringsIn(item, `${path}[${String(index)}]`, out));
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value))
      stringsIn(item, `${path}.${key}`, out);
  }
  return out;
}

// I-01, I-02
describe("core physics modules return structured data without embedded prose", () => {
  const strings = stringsIn(result.value.hours);

  it("all strings are programmatic enums or timestamps rather than localized prose", () => {
    for (const [path, value] of strings) {
      if (path.endsWith(".timeUtc")) continue;
      if (path.includes(".unit")) continue;
      if (path.includes(".site.")) continue;
      // Enums: lowercase, numbers, underscores without spaces or accents.
      expect(value, `${path} = ${value}`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("no strings contain embedded presentation markup", () => {
    for (const [path, value] of strings) {
      expect(value, path).not.toContain("[");
      expect(value, path).not.toContain("<");
    }
  });

  it("attribution is the only prose in daily result and is kept separate", () => {
    expect(result.value.attribution).toContain(" ");
    expect(stringsIn(result.value.hours).map(([, v]) => v)).not.toContain(
      result.value.attribution,
    );
  });

  it("no physics module imports i18n modules", () => {
    const offenders = execSync("find src -name '*.ts' -not -path 'src/i18n/*'", {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((file) => readFileSync(file, "utf8").includes('from "../i18n'));
    expect(offenders).toEqual([]);
  });
});
