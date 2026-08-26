import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WIND_SHADE_THRESHOLDS_MS, renderSkewT } from "../../src/render/skewt.js";
import { renderUpdraftProfile } from "../../src/render/profile.js";
import { renderDayTimeline } from "../../src/render/timeline.js";
import { DEFAULT_PALETTE, MIN_FONT_SIZE_PX } from "../../src/render/theme.js";
import { escapeText, round } from "../../src/render/svg.js";
import { GLIDER_CLUB } from "../../src/aircraft/profiles.js";
import { computeDay } from "../../src/report/assemble.js";
import { buildSounding } from "../../src/sounding/build.js";
import { celsiusToK } from "../../src/units/convert.js";
import { deg, m, mps } from "../../src/units/branded.js";
import {
  indexOfLocalHour,
  loadFixture,
  toHourlyObservations,
  toSoundingInput,
} from "../helpers/fixture.js";
import { FUENTEMILANOS_SITE } from "../helpers/sites.js";

const fixture = loadFixture("lefm-2026-08-18-icon_eu.json");
const built = buildSounding(toSoundingInput(fixture, indexOfLocalHour(fixture, 14)));
if (!built.ok) throw new Error(built.error.message);
const sounding = built.value;

const dayResult = computeDay({
  site: FUENTEMILANOS_SITE,
  hourly: toHourlyObservations(fixture, FUENTEMILANOS_SITE, "down_positive"),
  dateLocal: "2026-08-18",
  sunriseUtc: "2026-08-18T05:30",
  sunsetUtc: "2026-08-18T19:11",
});
if (!dayResult.ok) throw new Error(dayResult.error.message);
const day = dayResult.value;

const all = (): readonly [string, string][] => [
  ["skew-T", renderSkewT(sounding, { parcelFromK: celsiusToK(35.4) })],
  [
    "perfil",
    renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
      marks: { hcritAglM: m(2300), cloudBaseAglM: m(3200) },
    }),
  ],
  ["timeline", renderDayTimeline(day)],
];

// R-01
describe("los tres gráficos son SVG válido", () => {
  for (const [name, svg] of all()) {
    it(`${name} abre y cierra bien`, () => {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      // Etiquetas balanceadas: cada apertura tiene su cierre o es auto-cerrada.
      const opens = (svg.match(/<[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
      const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
      expect(opens).toBe(closes);
    });
  }
});

// R-02
describe("son responsive", () => {
  for (const [name, svg] of all()) {
    it(`${name} lleva viewBox y la raíz no lleva tamaño en píxeles`, () => {
      // Solo importa el elemento raíz: los `rect` internos sí llevan medidas.
      const root = /^<svg[^>]*>/.exec(svg)?.[0] ?? "";
      expect(root).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(root).not.toMatch(/\swidth="/);
      expect(root).not.toMatch(/\sheight="/);
      expect(root).toContain('preserveAspectRatio="xMidYMid meet"');
    });
  }
});

// R-03
describe("son accesibles", () => {
  for (const [name, svg] of all()) {
    it(`${name} lleva title, desc y aria-labelledby`, () => {
      expect(svg).toMatch(/<title id="t">[^<]+<\/title>/);
      expect(svg).toMatch(/<desc id="d">[^<]+<\/desc>/);
      expect(svg).toContain('role="img"');
      expect(svg).toContain('aria-labelledby="t d"');
    });
  }

  it("los textos se pueden personalizar", () => {
    const svg = renderDayTimeline(day, { title: "Mi día", desc: "Descripción propia" });
    expect(svg).toContain('<title id="t">Mi día</title>');
    expect(svg).toContain("Descripción propia");
  });
});

// R-04
describe("heredan el tema del consumidor", () => {
  it("los colores por defecto son variables CSS con respaldo", () => {
    for (const value of Object.values(DEFAULT_PALETTE)) {
      expect(value).toMatch(/^var\(--[a-z0-9-]+, #[0-9a-f]{6}\)$/);
    }
  });

  it("la paleta se puede sustituir entera o en parte", () => {
    const svg = renderUpdraftProfile(mps(2.5), m(2000), GLIDER_CLUB, {
      palette: { core: "tomato" },
    });
    expect(svg).toContain("tomato");
    expect(svg).toContain("var(--border");
  });
});

// R-07
describe("no hay texto ilegible", () => {
  for (const [name, svg] of all()) {
    it(`${name} no baja de ${String(MIN_FONT_SIZE_PX)} px`, () => {
      for (const match of svg.matchAll(/font-size="([\d.]+)"/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
      }
    });
  }
});

describe("primitivas", () => {
  it("escapan lo que podría romper el documento", () => {
    expect(escapeText('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("redondean para no arrastrar ruido de coma flotante", () => {
    expect(round(1 / 3)).toBe("0.33");
    expect(round(2.5, 0)).toBe("3");
    expect(round(Number.NaN)).toBe("0");
    expect(round(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("un título con comillas no rompe el SVG", () => {
    const svg = renderDayTimeline(day, { title: 'Día "raro" & <peligroso>' });
    expect(svg).toContain("&quot;raro&quot;");
    expect(svg).not.toContain("<peligroso>");
  });
});

// R-05
describe("sin dependencias externas", () => {
  it("ningún módulo de render importa un paquete de terceros", () => {
    const files = ["svg.ts", "theme.ts", "skewt.ts", "profile.ts", "timeline.ts"];
    for (const file of files) {
      const source = readFileSync(
        fileURLToPath(new URL(`../../src/render/${file}`, import.meta.url)),
        "utf8",
      );
      for (const match of source.matchAll(/from "([^"]+)"/g)) {
        expect(match[1]!.startsWith(".")).toBe(true);
      }
    }
  });
});

describe("contenido de cada gráfico", () => {
  it("el skew-T dibuja entorno, rocío, parcela y marcas", () => {
    const svg = renderSkewT(sounding, {
      parcelFromK: celsiusToK(35.4),
      lclMslM: m(4000),
      ceilingMslM: m(3300),
    });
    expect(svg).toContain(DEFAULT_PALETTE.temperature);
    expect(svg).toContain(DEFAULT_PALETTE.dewpoint);
    expect(svg).toContain(DEFAULT_PALETTE.parcel);
    expect(svg).toContain(
      `techo utilizable ${String(Math.round(3300 - sounding.site.elevationMslM))} m AGL`,
    );
    // La base de nubes ya no lleva rótulo de texto: la marca el glifo de nube
    // con su altura debajo, que es como se lee en un sondeo de verdad.
    expect(svg).toContain(">3000<");
    // Etiquetas de presión de los niveles que existen.
    expect(svg).toContain(">850<");
  });

  it("sin parcela no se dibuja la parcela", () => {
    expect(renderSkewT(sounding)).not.toContain(DEFAULT_PALETTE.parcel);
  });

  it("el perfil dibuja media, núcleo y variómetro", () => {
    const svg = renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
      marks: { hcritAglM: m(2300) },
    });
    expect(svg).toContain(DEFAULT_PALETTE.core);
    expect(svg).toContain(DEFAULT_PALETTE.climb);
    expect(svg).toContain("hcrit 2300 m AGL");
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThan(5);
  });

  it("la timeline resalta las ventanas y el mejor momento", () => {
    const svg = renderDayTimeline(day);
    expect(day.windows.length).toBeGreaterThan(0);
    expect(svg).toContain(DEFAULT_PALETTE.window);
    expect(svg).toContain('stroke-dasharray="3 3"');
    expect(svg).toContain("2026-08-18");
  });

  // La forma del día se lee de la envolvente, no de barras sueltas: dos
  // superficies rellenas —la utilizable y la que sube pero no compensa— con su
  // línea de techo y su línea de tope.
  it("la timeline dibuja las dos superficies de la capa convectiva", () => {
    const svg = renderDayTimeline(day);
    expect((svg.match(/<path[^>]*opacity="0\.16"/g) ?? []).length).toBe(1);
    expect((svg.match(/<path[^>]*opacity="0\.45"/g) ?? []).length).toBe(1);
    expect(svg).toContain(DEFAULT_PALETTE.core);
    expect(svg).toContain("tope de térmica");
    expect(svg).toContain("techo utilizable");
  });

  it("suaviza las dos líneas de altura conservando los puntos de datos", () => {
    const svg = renderDayTimeline(day);
    const paths = svg.match(/<path[^>]+\/>/g) ?? [];
    const top = paths.find((path) => path.includes(`stroke="${DEFAULT_PALETTE.core}"`));
    const ceiling = paths.find((path) =>
      path.includes(`stroke="${DEFAULT_PALETTE.ceiling}"`),
    );

    expect(top).toContain(" C ");
    expect(ceiling).toContain(" C ");

    const anchors = (path: string): [number, number][] => {
      const d = / d="([^"]+)"/.exec(path)?.[1] ?? "";
      const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      return [
        [numbers[0]!, numbers[1]!] as [number, number],
        ...Array.from(
          { length: (numbers.length - 2) / 6 },
          (_, index): [number, number] => {
            const offset = 2 + index * 6;
            return [numbers[offset + 4]!, numbers[offset + 5]!];
          },
        ),
      ];
    };

    const topAnchors = anchors(top ?? "");
    const ceilingAnchors = anchors(ceiling ?? "");
    for (const [x, ceilingY] of ceilingAnchors) {
      const topY = topAnchors.find(([topX]) => topX === x)?.[1];
      // En SVG la y crece hacia abajo, así que estar más alto es tener menos y.
      expect(topY).toBeLessThanOrEqual(ceilingY);
    }
  });

  it("parte el techo en los ceros sin cortar el tope ni su banda residual", () => {
    const gapped = {
      ...day,
      hours: day.hours.map((hour) => {
        const local = Number(hour.timeUtc.slice(11, 13));
        return {
          ...hour,
          ceiling: {
            ...hour.ceiling,
            aglM: m(local >= 9 && local <= 18 && local !== 12 ? 1200 : 0),
          },
          thermal: { ...hour.thermal, thermalTopAglM: m(2000) },
        };
      }),
    };
    const svg = renderDayTimeline(gapped);
    const paths = svg.match(/<path[^>]+\/>/g) ?? [];
    const ceilingLines = paths.filter((path) =>
      path.includes(`stroke="${DEFAULT_PALETTE.ceiling}"`),
    );
    const topLines = paths.filter((path) =>
      path.includes(`stroke="${DEFAULT_PALETTE.core}"`),
    );
    const usableAreas = paths.filter((path) => path.includes('opacity="0.45"'));
    const residual = paths.find((path) => path.includes('opacity="0.16"'));

    expect(ceilingLines).toHaveLength(2);
    expect(topLines).toHaveLength(1);
    expect(usableAreas).toHaveLength(2);
    expect(residual).toContain("218");

    // Las dos curvas de techo terminan y empiezan en los puntos exactos que
    // flanquean la hora a cero; ninguna baja hasta el eje en el trazo.
    expect(ceilingLines[0]).toContain('d="M 173.31 156.4');
    expect(ceilingLines[0]).toContain("246.06 156.4");
    expect(ceilingLines[1]).toContain('d="M 318.81 156.4');
    expect(ceilingLines[1]).toContain("500.69 156.4");
    for (const line of ceilingLines) expect(line).not.toContain("218");
  });

  it("la tira de viento se puede quitar, y sin ella no hay flechas", () => {
    const conViento = renderDayTimeline(day);
    expect(conViento).toContain(">viento<");
    expect(conViento).toContain(DEFAULT_PALETTE.wind);

    const sinViento = renderDayTimeline(day, { wind: false });
    expect(sinViento).not.toContain(">viento<");
    expect(sinViento).not.toContain(DEFAULT_PALETTE.wind);
  });

  // El día de la fixture es azul. Dibujar una base de cumulus sería inventar
  // una nube que no va a estar ahí.
  it("en día azul no se dibuja la base de cumulus", () => {
    const svg = renderDayTimeline(day);
    expect(day.hours.every((hour) => hour.cloud.blue)).toBe(true);
    expect(svg).not.toContain("base de cumulus");
  });

  it("un día sin horas volables se dibuja igual, sin reventar", () => {
    const empty = { ...day, hours: [], windows: [], best: null };
    const svg = renderDayTimeline(empty);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("la franja horaria se puede acotar", () => {
    const narrow = renderDayTimeline(day, { fromLocalHours: 12, toLocalHours: 14 });
    expect(narrow).toContain("<svg");
    expect(narrow.length).toBeLessThan(renderDayTimeline(day).length);
  });
});

// R-06
describe("instantáneas", () => {
  it("el skew-T de Fuentemilanos es estable", () => {
    expect(renderSkewT(sounding, { parcelFromK: celsiusToK(35.4) })).toMatchSnapshot();
  });

  it("el perfil de ascendencias es estable", () => {
    expect(
      renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
        marks: { hcritAglM: m(2300) },
      }),
    ).toMatchSnapshot();
  });

  it("la timeline del día es estable", () => {
    expect(renderDayTimeline(day)).toMatchSnapshot();
  });
});

describe("alturas equivalentes en el eje de presión", () => {
  it("rotula la altura sobre el terreno junto a cada nivel", () => {
    const svg = renderSkewT(sounding);
    expect(svg).toContain(">hPa<");
    expect(svg).toContain(">m AGL<");
    // 850 hPa está a 1566 m MSL en este sondeo, con el aeródromo a 1001 m:
    // 565 m sobre el terreno, redondeado a la decena.
    expect(svg).toContain(">570<");
    expect(svg).toContain(">850<");
  });

  it("puede rotularlas sobre el nivel del mar", () => {
    const svg = renderSkewT(sounding, { heightReference: "msl" });
    expect(svg).toContain(">m MSL<");
    expect(svg).toContain(">1570<");
  });

  it("las alturas salen del sondeo, no de la atmósfera estándar", () => {
    // En atmósfera estándar 700 hPa está a 3012 m; este sondeo lo pone a 3225.
    const svg = renderSkewT(sounding, { heightReference: "msl" });
    expect(svg).toContain(">3230<");
    expect(svg).not.toContain(">3010<");
  });

  it("crecen con la altura y nunca son negativas", () => {
    const svg = renderSkewT(sounding);
    const labels = [...svg.matchAll(/opacity="0.75">(\d+)</g)].map((m) => Number(m[1]));
    expect(labels.length).toBeGreaterThan(3);
    for (const value of labels) expect(value).toBeGreaterThanOrEqual(0);
    // El eje va de abajo arriba, así que las etiquetas salen en orden creciente.
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]!).toBeGreaterThan(labels[i - 1]!);
    }
  });
});

describe("columna de viento", () => {
  it("aparece por defecto, con velocidad y rumbos", () => {
    const svg = renderSkewT(sounding);
    expect(svg).toContain("km/h");
    // Una flecha por cada tramo muestreado: trazos con dos barbas.
    const arrows = (svg.match(/<path d="M [^"]*M [^"]*L [^"]*L [^"]*"/g) ?? []).length;
    expect(arrows).toBeGreaterThanOrEqual(4);
  });

  it("se puede quitar", () => {
    expect(renderSkewT(sounding, { wind: false })).not.toContain("km/h");
  });

  it("acepta nudos y metros por segundo", () => {
    expect(renderSkewT(sounding, { windUnit: "kt" })).toContain(">kt<");
    expect(renderSkewT(sounding, { windUnit: "ms" })).toContain(">m/s<");
  });

  it("sombrea desde 30 km/h y desde el corte de Allen", () => {
    expect(WIND_SHADE_THRESHOLDS_MS.brisk).toBeCloseTo(8.33, 2);
    expect(WIND_SHADE_THRESHOLDS_MS.cutoff).toBe(12.87);
    const svg = renderSkewT(sounding);
    expect((svg.match(/opacity="0\.1"|opacity="0\.18"/g) ?? []).length).toBe(2);
  });

  it("la flecha apunta hacia donde sopla, no de dónde viene", () => {
    // Viento del norte (0°) sopla hacia el sur: en pantalla, hacia abajo.
    const northerly = {
      ...sounding,
      levels: sounding.levels.map((l) => ({
        ...l,
        windFromDeg: deg(0),
        windSpeedMs: mps(8),
      })),
    };
    const svg = renderSkewT(northerly, {
      minTempK: celsiusToK(-40),
      maxTempK: celsiusToK(45),
    });
    const first = /<path d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/.exec(
      svg.slice(svg.indexOf("km/h")),
    );
    expect(first).not.toBeNull();
    if (first === null) return;
    // La punta queda por debajo de la cola: y crece hacia el sur.
    expect(Number(first[4])).toBeGreaterThan(Number(first[2]));
  });
});

describe("nube y capa", () => {
  it("dibuja el glifo en la base y rotula su altura", () => {
    const svg = renderSkewT(sounding, {
      lclMslM: m(2600),
      cloudTopMslM: m(3300),
    });
    expect(svg).toContain("<path");
    expect(svg).toContain(">1600<"); // 2600 MSL con el campo a 1001 m
    // Banda de nube sombreada entre base y techo.
    expect(svg).toMatch(/opacity="0\.14"/);
  });

  it("sin base de nubes no dibuja ni glifo ni banda", () => {
    const svg = renderSkewT(sounding, { wind: false });
    expect(svg).not.toMatch(/opacity="0\.14"/);
  });
});

describe("higiene del panel de viento y de los ejes", () => {
  const svg = renderSkewT(sounding);

  /** Extremos de cada flecha: cola y punta. */
  const arrowEnds = (markup: string) =>
    [...markup.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) M/g)].map(
      (m) => ({ tailY: Number(m[2]), tipY: Number(m[4]) }),
    );

  it("las flechas no se amontonan junto al suelo", () => {
    // Los niveles de altura caben todos en los primeros 200 m: repartirlas por
    // índice ponía cinco flechas en unos pocos píxeles.
    const ys = arrowEnds(svg)
      .map((a) => (a.tailY + a.tipY) / 2)
      .sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(30);
    }
  });

  it("ninguna flecha se sale del cuadro", () => {
    const panelTop = 30;
    for (const arrow of arrowEnds(svg)) {
      expect(Math.min(arrow.tailY, arrow.tipY)).toBeGreaterThanOrEqual(panelTop);
    }
  });

  it("la escala de viento usa cifras redondas", () => {
    const labels = [...svg.matchAll(/transform="rotate\(90[^"]*">(\d+)</g)].map((m) =>
      Number(m[1]),
    );
    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (const value of labels) expect(value % 5).toBe(0);
    // Y el paso es constante.
    const step = labels[1]! - labels[0]!;
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]! - labels[i - 1]!).toBe(step);
    }
  });

  it("la unidad va fuera del cuadro", () => {
    const unit = /<text x="[\d.]+" y="([\d.]+)"[^>]*text-anchor="end">km\/h<\/text>/.exec(
      svg,
    );
    expect(unit).not.toBeNull();
    if (unit !== null) expect(Number(unit[1])).toBeLessThan(30);
  });

  it("los rótulos del eje izquierdo van abajo, no encima del último nivel", () => {
    expect(svg).toContain(">hPa<");
    expect(svg).toContain(">m AGL<");
    const caption = /<text x="[\d.]+" y="([\d.]+)"[^>]*>hPa<\/text>/.exec(svg);
    expect(caption).not.toBeNull();
    // Por debajo del gráfico, no en el margen superior donde estaba el 500 hPa.
    if (caption !== null) expect(Number(caption[1])).toBeGreaterThan(400);
  });
});
