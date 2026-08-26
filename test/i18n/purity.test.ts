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

/** Recoge todas las cadenas del árbol, con la ruta en la que aparecen. */
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
describe("el núcleo no devuelve texto", () => {
  const strings = stringsIn(result.value.hours);

  it("todas las cadenas son enums o marcas de tiempo, nunca prosa", () => {
    for (const [path, value] of strings) {
      if (path.endsWith(".timeUtc")) continue;
      if (path.includes(".unit")) continue;
      // El emplazamiento lo aporta el consumidor y se devuelve tal cual: su
      // nombre y su zona horaria son suyos, no prosa generada por la librería.
      if (path.includes(".site.")) continue;
      // Un enum: minúsculas, dígitos y guiones bajos. Sin espacios ni acentos.
      expect(value, `${path} = ${value}`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("ninguna cadena lleva marcado de presentación", () => {
    // El predecesor devolvía cosas como "[green]Bajo[/green]" dentro de los
    // valores, y luego necesitaba una función para limpiarlas.
    for (const [path, value] of strings) {
      expect(value, path).not.toContain("[");
      expect(value, path).not.toContain("<");
    }
  });

  it("la atribución es la única prosa del día, y va aparte", () => {
    expect(result.value.attribution).toContain(" ");
    expect(stringsIn(result.value.hours).map(([, v]) => v)).not.toContain(
      result.value.attribution,
    );
  });

  it("ningún módulo de física importa el de textos", () => {
    const offenders = execSync("find src -name '*.ts' -not -path 'src/i18n/*'", {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((file) => readFileSync(file, "utf8").includes('from "../i18n'));
    expect(offenders).toEqual([]);
  });
});
