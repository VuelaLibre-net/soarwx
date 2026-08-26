import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SUBPATHS = {
  ".": "dist/index.d.ts",
  units: "dist/units/index.d.ts",
  thermo: "dist/thermo/index.d.ts",
  sounding: "dist/sounding/index.d.ts",
  convection: "dist/convection/index.d.ts",
  clouds: "dist/clouds/index.d.ts",
  stability: "dist/stability/index.d.ts",
  orographic: "dist/orographic/index.d.ts",
  aircraft: "dist/aircraft/index.d.ts",
  forecast: "dist/forecast/index.d.ts",
  report: "dist/report/index.d.ts",
  openmeteo: "dist/openmeteo/index.d.ts",
  render: "dist/render/index.d.ts",
  "i18n/es": "dist/i18n/es.d.ts",
  "i18n/en": "dist/i18n/en.d.ts",
};

/** file -> Map(localName -> {kind, sig, doc}) */
const DECLS = new Map();
/** file -> Map(localName -> {file, name}) brought by import */
const IMPORTS = new Map();
/** file -> Map(exportedAlias -> localName) */
const ALIASES = new Map();

function parse(file) {
  if (DECLS.has(file)) return;
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    DECLS.set(file, new Map());
    return;
  }
  const decls = new Map();
  const imports = new Map();
  const lines = src.split("\n");
  let doc = [],
    inDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\*\*/.test(line)) {
      inDoc = true;
      doc = [];
    }
    if (inDoc) {
      doc.push(line.replace(/^\s*\/\*\*|^\s*\*\/|^\s*\*/g, "").trim());
      if (/\*\//.test(line)) inDoc = false;
      continue;
    }
    const m = /^(?:declare )?(function|const|type|interface|class|enum) (\w+)/.exec(line);
    if (!m) {
      // A true docblock sits directly above its declaration. If there is a blank line
      // in between, it belongs to the module and does not describe what follows.
      if (!line.trim() || !/^import|^export/.test(line)) doc = [];
      continue;
    }
    let sig = "",
      depth = 0,
      j = i;
    for (; j < lines.length; j++) {
      sig += (sig ? "\n" : "") + lines[j];
      for (const ch of lines[j]) {
        if ("({[".includes(ch)) depth++;
        else if (")}]".includes(ch)) depth--;
      }
      if (depth <= 0 && /[;}]\s*$/.test(lines[j])) break;
    }
    i = j;
    decls.set(m[2], {
      kind: m[1],
      sig: sig.replace(/^declare /, ""),
      doc: doc.filter(Boolean),
    });
    doc = [];
  }
  DECLS.set(file, decls);

  // export { local as alias }  (without `from`): local alias of the chunk.
  const aliases = new Map();
  for (const block of src.matchAll(/export\s*(?:type\s*)?{([^}]*)}\s*;/gs)) {
    for (const part of block[1].split(",")) {
      const t = part.trim().replace(/^type\s+/, "");
      const as = /^(\w+)\s+as\s+(\w+)$/.exec(t);
      if (as) aliases.set(as[2], as[1]);
    }
  }
  ALIASES.set(file, aliases);

  for (const im of src.matchAll(
    /(?:import|export)\s*(?:type\s*)?{([^}]*)}\s*from\s*['"](\.[^'"]+)['"]/gs,
  )) {
    const target = resolve(dirname(file), im[2].replace(/\.js$/, ".d.ts"));
    for (const part of im[1].split(",")) {
      const t = part.trim().replace(/^type\s+/, "");
      if (!t) continue;
      const as = /^(\w+)\s+as\s+(\w+)$/.exec(t);
      if (as) imports.set(as[2], { file: target, name: as[1] });
      else imports.set(t, { file: target, name: t });
    }
    parse(target);
  }
  IMPORTS.set(file, imports);
}

function lookup(file, name, hops = 0) {
  if (hops > 6) return null;
  const local = ALIASES.get(file)?.get(name) ?? name;
  const own = DECLS.get(file)?.get(local);
  if (own)
    return {
      ...own,
      sig: local === name ? own.sig : own.sig.replace(new RegExp(`\\b${local}\\b`), name),
    };
  const im = IMPORTS.get(file)?.get(name);
  if (!im) return null;
  const found = lookup(im.file, im.name, hops + 1);
  if (!found) return null;
  return { ...found, sig: found.sig.replace(new RegExp(`\\b${im.name}\\b`), name) };
}

function exportedNames(file) {
  const src = readFileSync(file, "utf8");
  const names = new Set();
  for (const block of src.matchAll(/export\s*(?:type\s*)?{([^}]*)}/gs)) {
    for (const part of block[1].split(",")) {
      const t = part.trim().replace(/^type\s+/, "");
      if (!t) continue;
      const as = / as (\w+)$/.exec(t);
      names.add(as ? as[1] : t);
    }
  }
  return [...names];
}

const result = {};
for (const [sub, rel] of Object.entries(SUBPATHS)) {
  const file = resolve(ROOT, rel);
  parse(file);
  result[sub] = exportedNames(file)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => {
      const d = lookup(file, n);
      return { name: n, kind: d?.kind ?? "?", sig: d?.sig ?? "", doc: d?.doc ?? [] };
    });
}
writeFileSync(resolve(HERE, "api.json"), JSON.stringify(result, null, 1));
let total = 0,
  missing = 0;
for (const [sub, items] of Object.entries(result)) {
  const m = items.filter((i) => i.kind === "?");
  total += items.length;
  missing += m.length;
  console.log(
    `${sub.padEnd(11)} ${String(items.length).padStart(3)}  unresolved: ${m.map((x) => x.name).join(", ") || "-"}`,
  );
}
console.log(`\ntotal ${total}, unresolved ${missing}`);
