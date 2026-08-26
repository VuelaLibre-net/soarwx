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
    "profile",
    renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
      marks: { hcritAglM: m(2300), cloudBaseAglM: m(3200) },
    }),
  ],
  ["timeline", renderDayTimeline(day)],
];

// R-01
describe("all three charts produce valid SVG", () => {
  for (const [name, svg] of all()) {
    it(`${name} opens and closes correctly`, () => {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      // Balanced tags: each open tag matches a closing tag or is self-closing.
      const opens = (svg.match(/<[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
      const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
      expect(opens).toBe(closes);
    });
  }
});

// R-02
describe("charts are responsive", () => {
  for (const [name, svg] of all()) {
    it(`${name} includes viewBox and root element omits hardcoded pixel dimensions`, () => {
      const root = /^<svg[^>]*>/.exec(svg)?.[0] ?? "";
      expect(root).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(root).not.toMatch(/\swidth="/);
      expect(root).not.toMatch(/\sheight="/);
      expect(root).toContain('preserveAspectRatio="xMidYMid meet"');
    });
  }
});

// R-03
describe("charts are accessible", () => {
  for (const [name, svg] of all()) {
    it(`${name} includes title, desc, and aria-labelledby attributes`, () => {
      expect(svg).toMatch(/<title id="t">[^<]+<\/title>/);
      expect(svg).toMatch(/<desc id="d">[^<]+<\/desc>/);
      expect(svg).toContain('role="img"');
      expect(svg).toContain('aria-labelledby="t d"');
    });
  }

  it("titles and descriptions can be customized", () => {
    const svg = renderDayTimeline(day, {
      title: "Custom Day",
      desc: "Custom description",
    });
    expect(svg).toContain('<title id="t">Custom Day</title>');
    expect(svg).toContain("Custom description");
  });
});

// R-04
describe("theme adaptation", () => {
  it("default palette entries use CSS custom properties with fallbacks", () => {
    for (const value of Object.values(DEFAULT_PALETTE)) {
      expect(value).toMatch(/^var\(--[a-z0-9-]+, #[0-9a-f]{6}\)$/);
    }
  });

  it("palette can be overridden partially or completely", () => {
    const svg = renderUpdraftProfile(mps(2.5), m(2000), GLIDER_CLUB, {
      palette: { core: "tomato" },
    });
    expect(svg).toContain("tomato");
    expect(svg).toContain("var(--border");
  });
});

// R-07
describe("text legibility constraints", () => {
  for (const [name, svg] of all()) {
    it(`${name} font size remains >= ${String(MIN_FONT_SIZE_PX)} px`, () => {
      for (const match of svg.matchAll(/font-size="([\d.]+)"/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
      }
    });
  }
});

describe("SVG primitives", () => {
  it("escapes characters that could corrupt document XML", () => {
    expect(escapeText('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("rounds numbers to avoid floating point noise", () => {
    expect(round(1 / 3)).toBe("0.33");
    expect(round(2.5, 0)).toBe("3");
    expect(round(Number.NaN)).toBe("0");
    expect(round(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("title with special characters does not break SVG markup", () => {
    const svg = renderDayTimeline(day, { title: 'Day "test" & <danger>' });
    expect(svg).toContain("&quot;test&quot;");
    expect(svg).not.toContain("<danger>");
  });
});

// R-05
describe("zero external runtime dependencies", () => {
  it("no render module imports third-party packages", () => {
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

describe("chart rendering content", () => {
  it("skew-T renders environment, dewpoint, parcel trajectory, and level marks", () => {
    const svg = renderSkewT(sounding, {
      parcelFromK: celsiusToK(35.4),
      lclMslM: m(4000),
      ceilingMslM: m(3300),
    });
    expect(svg).toContain(DEFAULT_PALETTE.temperature);
    expect(svg).toContain(DEFAULT_PALETTE.dewpoint);
    expect(svg).toContain(DEFAULT_PALETTE.parcel);
    expect(svg).toContain(
      `usable ceiling ${String(Math.round(3300 - sounding.site.elevationMslM))} m AGL`,
    );
    expect(svg).toContain(">3000<");
    expect(svg).toContain(">850<");
  });

  it("omits parcel trajectory when parcel temperature is not provided", () => {
    expect(renderSkewT(sounding)).not.toContain(DEFAULT_PALETTE.parcel);
  });

  it("updraft profile renders mean, core, and variometer curves", () => {
    const svg = renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
      marks: { hcritAglM: m(2300) },
    });
    expect(svg).toContain(DEFAULT_PALETTE.core);
    expect(svg).toContain(DEFAULT_PALETTE.climb);
    expect(svg).toContain("hcrit 2300 m AGL");
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThan(5);
  });

  it("timeline highlights soaring windows and best hour", () => {
    const svg = renderDayTimeline(day);
    expect(day.windows.length).toBeGreaterThan(0);
    expect(svg).toContain(DEFAULT_PALETTE.window);
    expect(svg).toContain('stroke-dasharray="3 3"');
    expect(svg).toContain("2026-08-18");
  });

  it("timeline renders both convective layer surfaces", () => {
    const svg = renderDayTimeline(day);
    expect((svg.match(/<path[^>]*opacity="0\.16"/g) ?? []).length).toBe(1);
    expect((svg.match(/<path[^>]*opacity="0\.45"/g) ?? []).length).toBe(1);
    expect(svg).toContain(DEFAULT_PALETTE.core);
    expect(svg).toContain("thermal top");
    expect(svg).toContain("usable ceiling");
  });

  it("smooths altitude curves while preserving data points", () => {
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
      expect(topY).toBeLessThanOrEqual(ceilingY);
    }
  });

  it("splits ceiling curve across zero-soaring hours cleanly", () => {
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

    expect(ceilingLines[0]).toContain('d="M 173.31 156.4');
    expect(ceilingLines[0]).toContain("246.06 156.4");
    expect(ceilingLines[1]).toContain('d="M 318.81 156.4');
    expect(ceilingLines[1]).toContain("500.69 156.4");
    for (const line of ceilingLines) expect(line).not.toContain("218");
  });

  it("wind strip can be disabled to omit arrows", () => {
    const withWind = renderDayTimeline(day);
    expect(withWind).toContain(">wind<");
    expect(withWind).toContain(DEFAULT_PALETTE.wind);

    const withoutWind = renderDayTimeline(day, { wind: false });
    expect(withoutWind).not.toContain(">wind<");
    expect(withoutWind).not.toContain(DEFAULT_PALETTE.wind);
  });

  it("omits cumulus base line on blue thermal days", () => {
    const svg = renderDayTimeline(day);
    expect(day.hours.every((hour) => hour.cloud.blue)).toBe(true);
    expect(svg).not.toContain("cumulus base");
  });

  it("renders empty soaring day without error", () => {
    const empty = { ...day, hours: [], windows: [], best: null };
    const svg = renderDayTimeline(empty);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("supports narrowing display hour range", () => {
    const narrow = renderDayTimeline(day, { fromLocalHours: 12, toLocalHours: 14 });
    expect(narrow).toContain("<svg");
    expect(narrow.length).toBeLessThan(renderDayTimeline(day).length);
  });
});

// R-06
describe("rendering snapshot stability", () => {
  it("Fuentemilanos skew-T snapshot matches", () => {
    expect(renderSkewT(sounding, { parcelFromK: celsiusToK(35.4) })).toMatchSnapshot();
  });

  it("updraft profile snapshot matches", () => {
    expect(
      renderUpdraftProfile(mps(2.8), m(2600), GLIDER_CLUB, {
        marks: { hcritAglM: m(2300) },
      }),
    ).toMatchSnapshot();
  });

  it("day timeline snapshot matches", () => {
    expect(renderDayTimeline(day)).toMatchSnapshot();
  });
});

describe("pressure axis equivalent altitude labels", () => {
  it("labels height AGL beside isobaric pressure levels", () => {
    const svg = renderSkewT(sounding);
    expect(svg).toContain(">hPa<");
    expect(svg).toContain(">m AGL<");
    expect(svg).toContain(">570<");
    expect(svg).toContain(">850<");
  });

  it("supports MSL height reference mode", () => {
    const svg = renderSkewT(sounding, { heightReference: "msl" });
    expect(svg).toContain(">m MSL<");
    expect(svg).toContain(">1570<");
  });

  it("derives heights from sounding geopotential rather than standard atmosphere", () => {
    const svg = renderSkewT(sounding, { heightReference: "msl" });
    expect(svg).toContain(">3230<");
    expect(svg).not.toContain(">3010<");
  });

  it("altitudes increase with height and remain non-negative", () => {
    const svg = renderSkewT(sounding);
    const labels = [...svg.matchAll(/opacity="0.75">(\d+)</g)].map((m) => Number(m[1]));
    expect(labels.length).toBeGreaterThan(3);
    for (const value of labels) expect(value).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]!).toBeGreaterThan(labels[i - 1]!);
    }
  });
});

describe("wind panel", () => {
  it("renders by default with speed scale and direction arrows", () => {
    const svg = renderSkewT(sounding);
    expect(svg).toContain("km/h");
    const arrows = (svg.match(/<path d="M [^"]*M [^"]*L [^"]*L [^"]*"/g) ?? []).length;
    expect(arrows).toBeGreaterThanOrEqual(4);
  });

  it("can be disabled", () => {
    expect(renderSkewT(sounding, { wind: false })).not.toContain("km/h");
  });

  it("supports knots and metres per second units", () => {
    expect(renderSkewT(sounding, { windUnit: "kt" })).toContain(">kt<");
    expect(renderSkewT(sounding, { windUnit: "ms" })).toContain(">m/s<");
  });

  it("shades brisk and cutoff wind threshold zones", () => {
    expect(WIND_SHADE_THRESHOLDS_MS.brisk).toBeCloseTo(8.33, 2);
    expect(WIND_SHADE_THRESHOLDS_MS.cutoff).toBe(12.87);
    const svg = renderSkewT(sounding);
    expect((svg.match(/opacity="0\.1"|opacity="0\.18"/g) ?? []).length).toBe(2);
  });

  it("wind arrow points downwind (toward flow direction)", () => {
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
    expect(Number(first[4])).toBeGreaterThan(Number(first[2]));
  });
});

describe("cloud layer and base", () => {
  it("renders cloud glyph at LCL and labels base altitude", () => {
    const svg = renderSkewT(sounding, {
      lclMslM: m(2600),
      cloudTopMslM: m(3300),
    });
    expect(svg).toContain("<path");
    expect(svg).toContain(">1600<");
    expect(svg).toMatch(/opacity="0\.14"/);
  });

  it("omits cloud glyph and layer when cloud base is omitted", () => {
    const svg = renderSkewT(sounding, { wind: false });
    expect(svg).not.toMatch(/opacity="0\.14"/);
  });
});

describe("wind panel and axis layout hygiene", () => {
  const svg = renderSkewT(sounding);

  const arrowEnds = (markup: string) =>
    [...markup.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) M/g)].map(
      (m) => ({ tailY: Number(m[2]), tipY: Number(m[4]) }),
    );

  it("prevents wind arrow crowding near surface", () => {
    const ys = arrowEnds(svg)
      .map((a) => (a.tailY + a.tipY) / 2)
      .sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(30);
    }
  });

  it("contains all wind arrows within panel bounds", () => {
    const panelTop = 30;
    for (const arrow of arrowEnds(svg)) {
      expect(Math.min(arrow.tailY, arrow.tipY)).toBeGreaterThanOrEqual(panelTop);
    }
  });

  it("formats wind speed scale with round step increments", () => {
    const labels = [...svg.matchAll(/transform="rotate\(90[^"]*">(\d+)</g)].map((m) =>
      Number(m[1]),
    );
    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (const value of labels) expect(value % 5).toBe(0);
    const step = labels[1]! - labels[0]!;
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]! - labels[i - 1]!).toBe(step);
    }
  });

  it("positions wind unit label above panel", () => {
    const unit = /<text x="[\d.]+" y="([\d.]+)"[^>]*text-anchor="end">km\/h<\/text>/.exec(
      svg,
    );
    expect(unit).not.toBeNull();
    if (unit !== null) expect(Number(unit[1])).toBeLessThan(30);
  });

  it("places left axis unit labels at bottom", () => {
    expect(svg).toContain(">hPa<");
    expect(svg).toContain(">m AGL<");
    const caption = /<text x="[\d.]+" y="([\d.]+)"[^>]*>hPa<\/text>/.exec(svg);
    expect(caption).not.toBeNull();
    if (caption !== null) expect(Number(caption[1])).toBeGreaterThan(400);
  });
});
