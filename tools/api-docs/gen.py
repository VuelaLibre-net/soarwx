"""Genera docs/API.md a partir de api.json (extraído de dist/**/*.d.ts) más la
prosa y los ejemplos escritos a mano de MODULES."""

import json, re, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent

API = json.loads((HERE / "api.json").read_text())

# ---------------------------------------------------------------- utilidades

def summary(doc):
    if not doc:
        return ""
    out = []
    for line in doc:
        if line.startswith("@"):
            break
        out.append(line)
        if line.rstrip().endswith((".", ":", "!")):
            break
    text = " ".join(out).strip()
    text = re.sub(r"\s+", " ", text)
    m = re.match(r"^(.+?\.)(\s|$)", text)
    return (m.group(1) if m else text).strip()


def described(doc):
    """Descripción para la tabla. La raya marca que el símbolo se explica solo."""
    return summary(doc) or "—"


def source(doc):
    for line in doc:
        if line.startswith("@source"):
            rest = line[len("@source"):].strip()
            m = re.search(r"([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&.\-]*(?:\s+(?:&|et\s+al\.|[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ.\-]*))*)[^(]*\((\d{4})\)", rest)
            if m:
                return f"{m.group(1).strip().rstrip(',')} ({m.group(2)})"
            return rest.split(",")[0].split(";")[0].strip().rstrip(".")
    return ""


def one_line(sig):
    return re.sub(r"\s+", " ", sig.replace("\n", " ")).strip().rstrip(";")


def cell(text):
    return text.replace("|", "\\|")


def code(text):
    return "`" + cell(text) + "`"


def kind_of(item):
    return item["kind"]


def type_shape(item):
    sig = item["sig"]
    name = item["name"]
    if item["kind"] in ("type", "enum"):
        flat = one_line(sig)
        if len(flat) <= 150:
            return flat
        return f"type {name} = …"
    fields = len(re.findall(r"^\s{4}(?:readonly\s+)?[\w\[\]\"']+[?]?:", sig, re.M))
    extends = re.search(r"interface \w+ extends ([\w, ]+)", sig)
    ext = f" extends {extends.group(1).strip()}" if extends else ""
    return f"interface {name}{ext} — {fields} campos"


def tables(sub):
    items = API[sub]
    funcs = [i for i in items if i["kind"] == "function" or
             (i["kind"] == "const" and re.search(r":\s*\(.*\)\s*=>", i["sig"]))]
    consts = [i for i in items if i["kind"] == "const" and i not in funcs]
    types = [i for i in items if i["kind"] in ("type", "interface", "class", "enum")]

    out = []
    if funcs:
        has_src = any(source(i["doc"]) for i in funcs)
        head = "| Firma | Qué hace |" + (" Fuente |" if has_src else "")
        rule = "|---|---|" + ("---|" if has_src else "")
        out.append("**Funciones**\n\n" + head + "\n" + rule)
        for i in funcs:
            row = f"| {code(one_line(i['sig']))} | {cell(described(i["doc"]))} |"
            if has_src:
                row += f" {cell(source(i['doc']))} |"
            out.append(row)
        out.append("")
    if consts:
        out.append("**Constantes**\n\n| Nombre | Declaración | Qué es |\n|---|---|---|")
        for i in consts:
            out.append(f"| `{i['name']}` | {code(one_line(i['sig']))} | {cell(described(i["doc"]))} |")
        out.append("")
    if types:
        out.append("**Tipos**\n\n| Nombre | Forma | Para qué |\n|---|---|---|")
        for i in types:
            out.append(f"| `{i['name']}` | {code(type_shape(i))} | {cell(described(i["doc"]))} |")
        out.append("")
    return "\n".join(out)


# ------------------------------------------------------------------ contenido

MODULES = json.loads((HERE / "prose.json").read_text())

HEADER = (HERE / "header.md").read_text()

parts = [HEADER.rstrip(), "", "---", "", "## Referencia por módulo", ""]
for sub, meta in MODULES.items():
    parts.append(f"### `{meta['import']}`")
    parts.append("")
    parts.append(meta["intro"].strip())
    parts.append("")
    if meta.get("example"):
        parts.append("```ts")
        parts.append(meta["example"].strip())
        parts.append("```")
        parts.append("")
    parts.append(tables(sub))
    parts.append("")

total = sum(len(v) for v in API.values())
parts.append("---")
parts.append("")
parts.append(f"Esta referencia cubre los **{total} símbolos exportados** por los "
             "catorce puntos de entrada del paquete. Se genera a partir de los "
             "`.d.ts` publicados, así que no puede desviarse de lo que compila.")
parts.append("")

(ROOT / "docs/API.md").write_text("\n".join(parts))
print("escrito docs/API.md", total, "símbolos")
