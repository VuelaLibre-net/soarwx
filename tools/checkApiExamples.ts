/**
 * Extrae los ejemplos de `docs/API.md` a `test/docs/apiExamples.ts` para que
 * `pnpm typecheck` los compile.
 *
 * Un ejemplo que no compila es peor que ninguno: manda al lector a una firma
 * que ya no existe. Aquí la documentación se rompe con el mismo `pnpm check`
 * que rompe el código.
 *
 * Las variables libres de los ejemplos (`site`, `sounding`, `hourly`…) se
 * declaran en el preámbulo con su tipo real, así que su uso también se verifica.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/API.md");
const OUT_DIR = resolve(ROOT, "test/docs/examples");

/** `soarwx/x` -> ruta relativa al fuente, para compilar contra `src/`. */
function rewriteImport(spec: string): string {
  if (spec === "soarwx") return "../../src/index.js";
  if (spec === "soarwx/i18n/es") return "../../src/i18n/es.js";
  const m = /^soarwx\/(.+)$/.exec(spec);
  return m?.[1] === undefined ? spec : `../../src/${m[1]}/index.js`;
}

/** Variables libres que los ejemplos dan por dadas, con su tipo real. */
const FIXTURES = `import type * as Root from "../../../src/index.js";
import type * as Snd from "../../../src/sounding/index.js";
import type * as Cnv from "../../../src/convection/index.js";
import type * as Rep from "../../../src/report/index.js";
import type * as Fct from "../../../src/forecast/index.js";
import type * as Uni from "../../../src/units/index.js";
import type * as Om from "../../../src/openmeteo/index.js";

declare const site: Root.Site;
declare const fuentemilanos: Root.Site;
declare const sounding: Snd.Sounding;
declare const surface: Snd.SurfaceState;
declare const pressureLevels: readonly Snd.RawPressureLevel[];
declare const heightLevels: readonly Snd.RawHeightLevel[];
declare const samples: readonly Cnv.FluxSample[];
declare const hourly: readonly Rep.HourlyObservation[];
declare const hours: readonly Fct.ScoredHour[];
declare const day: Rep.SoaringDay;
declare const maxSurfaceTempK: Uni.Kelvin;
declare const wStarMs: Uni.MPerS;
declare const ziAglM: Uni.Metres;
declare const fixture: Om.OpenMeteoResponse;
declare const container: { innerHTML: string };
`;

const HEADER = `/* GENERADO por tools/checkApiExamples.ts a partir de docs/API.md.
   No editar a mano: se regenera con \`pnpm docs:examples\`.

   Si una firma de la librería cambia y el ejemplo deja de compilar, el
   \`pnpm typecheck\` de \`pnpm check\` falla, y la documentación se arregla
   antes de publicarse. */
`;

/** Une las importaciones repartidas en varias líneas en una sola. */
function joinImports(source: string): string {
  return source.replace(/^import\s+[^;]*?from\s+"[^"]+";/gms, (match) =>
    match
      .replace(/\s*\n\s*/g, " ")
      .replace(/\{ /g, "{ ")
      .replace(/,\s*}/, " }"),
  );
}

function extract(markdown: string): { title: string; body: string }[] {
  const blocks: { title: string; body: string }[] = [];
  const lines = markdown.split("\n");
  let heading = "intro";
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{2,3}\s+(.+)$/.exec(lines[i] ?? "");
    if (h) heading = h[1] ?? heading;
    if ((lines[i] ?? "").trim() !== "```ts") continue;
    const body: string[] = [];
    for (i++; i < lines.length && (lines[i] ?? "").trim() !== "```"; i++)
      body.push(lines[i] ?? "");
    blocks.push({ title: heading, body: joinImports(body.join("\n")) });
  }
  return blocks;
}

/** Nombres de valor que trae un `import` (los de tipo no se pueden consumir). */
function importedValues(line: string): string[] {
  if (/^import\s+type\s/.test(line.trim())) return [];
  const star = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(line.trim());
  if (star) return [star[1] ?? ""];
  const braces = /{([^}]*)}/.exec(line);
  if (!braces) return [];
  return (braces[1] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !part.startsWith("type "))
    .map((part) => (part.split(/\s+as\s+/).pop() ?? "").trim())
    .filter(Boolean);
}

/** Nombres declarados en el nivel superior del ejemplo, para consumirlos. */
function topLevelBindings(body: string): string[] {
  const names = new Set<string>();
  for (const m of body.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm))
    names.add(m[1] ?? "");
  for (const m of body.matchAll(/^const\s*\{\s*([^}]+)\}/gm)) {
    for (const part of (m[1] ?? "").split(",")) {
      const n = part.split(":").pop()?.trim();
      if (n) names.add(n);
    }
  }
  for (const m of body.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm))
    names.add(m[1] ?? "");
  return [...names].filter(Boolean);
}

const doc = readFileSync(DOC, "utf8");
const blocks = extract(doc);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

blocks.forEach((block, index) => {
  const imports: string[] = [];
  const rest: string[] = [];
  const used: string[] = [];
  for (const line of block.body.split("\n")) {
    const im = /^import\s+(?:type\s+)?.*from\s+"([^"]+)";?$/.exec(line.trim());
    if (im) {
      const spec = im[1] ?? "";
      imports.push(line.replace(`"${spec}"`, `"../${rewriteImport(spec)}"`));
      used.push(...importedValues(line));
    } else rest.push(line);
  }
  const body = rest.join("\n").trim();
  const consumed = [...new Set([...used, ...topLevelBindings(body)])];
  const consume = consumed.length > 0 ? `\n  void [${consumed.join(", ")}];` : "";

  const file = resolve(OUT_DIR, `example-${String(index + 1).padStart(2, "0")}.ts`);
  writeFileSync(
    file,
    `${HEADER}\n${FIXTURES}\n${imports.join("\n")}\n\n` +
      `/** ${block.title} */\nexport async function example(): Promise<unknown> {\n` +
      body.replace(/^/gm, "  ") +
      consume +
      `\n  return undefined;\n}\n`,
  );
});

console.log(`escritos ${String(blocks.length)} ejemplos en test/docs/examples/`);
