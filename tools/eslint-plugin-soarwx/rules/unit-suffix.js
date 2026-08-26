/**
 * Exige que toda propiedad numérica de un tipo exportado lleve sufijo de unidad.
 *
 * Regla de `docs/SPEC.md` §2 y `docs/REQUIREMENTS.md` NF-5. El histórico del
 * predecesor está lleno de errores de unidad (km/h tratado como nudos, IAS
 * tratada como velocidad respecto al suelo). El sufijo hace que el error salte
 * en revisión y en el compilador.
 *
 * Los tipos marcados (`Kelvin`, `Metres`, ...) no disparan la regla: solo se
 * inspecciona `number` desnudo.
 */

const DEFAULT_SUFFIXES = [
  "K", // kelvin
  "Pa", // pascal
  "M", // metro
  "Ms", // metro/segundo
  "Deg", // grado
  "Wm2", // vatio/metro²
  "Jkg", // julio/kilogramo
  "KgKg", // kg/kg
  "KMs", // kelvin·metro/segundo (flujo cinemático)
  "Frac", // fracción 0..1
  "Hpa", // hectopascal (solo en adaptadores de entrada)
  "MsPerKm", // cizalladura
  "KPerM", // gradiente térmico
  "Utc", // marca de tiempo ISO
  "Seconds",
  "Ms2", // metro/segundo²
  "KgM3", // kilogramo/metro³
  "PerM2", // metro⁻² (parámetro de Scorer)
  "PerS2", // segundo⁻² (frecuencia de Brunt-Väisälä al cuadrado)
  "Hours", // horas
  "Km", // kilómetro
  "Days", // días
  "Px", // píxel (solo en el lienzo del render)
];

/**
 * Sufijos que denotan una magnitud adimensional por su propia naturaleza:
 * cuentas, índices y cocientes. Evita que la lista de nombres exactos crezca
 * sin fin.
 */
const DEFAULT_DIMENSIONLESS_SUFFIXES = [
  "Used",
  "Count",
  "Ratio",
  "Iterations",
  "Levels",
  "Index",
  "Points",
];

/** Nombres explícitamente adimensionales. Ampliable por configuración. */
const DEFAULT_DIMENSIONLESS = [
  "score",
  "weight",
  "value",
  "ratio",
  "level",
  "levelBeforeVetoes",
  "count",
  "maxIterations",
  "iterations",
  "rank",
  "status",
  "retries",
  "index",
  "idealMin",
  "idealMax",
  "zeroMin",
  "zeroMax",
  "capsAtLevel",
  "levelsUsed",
  "levelsDiscardedBelowGround",
  "bowenRatio",
  "albedoFrac",
  "divergenceFrac",
  "generationtimeMs",
];

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Las propiedades `number` de los tipos exportados deben llevar sufijo de unidad.",
    },
    schema: [
      {
        type: "object",
        properties: {
          suffixes: { type: "array", items: { type: "string" } },
          dimensionless: { type: "array", items: { type: "string" } },
          dimensionlessSuffixes: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        "`{{name}}` es `number` sin sufijo de unidad. Usa uno de: {{suffixes}} — o un tipo marcado (SPEC §2).",
    },
  },

  create(context) {
    const opts = context.options[0] ?? {};
    const suffixes = opts.suffixes ?? DEFAULT_SUFFIXES;
    const dimensionless = new Set(opts.dimensionless ?? DEFAULT_DIMENSIONLESS);
    const dimensionlessSuffixes =
      opts.dimensionlessSuffixes ?? DEFAULT_DIMENSIONLESS_SUFFIXES;

    /** ¿La anotación es `number`, o una unión que lo contenga? */
    function isBareNumber(annotation) {
      if (!annotation) return false;
      if (annotation.type === "TSNumberKeyword") return true;
      if (annotation.type === "TSUnionType") {
        return annotation.types.some((t) => t.type === "TSNumberKeyword");
      }
      return false;
    }

    /** ¿El nodo está dentro de una declaración de tipo exportada? */
    function insideExportedType(node) {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === "TSInterfaceDeclaration" || n.type === "TSTypeAliasDeclaration") {
          return n.parent?.type === "ExportNamedDeclaration";
        }
      }
      return false;
    }

    return {
      TSPropertySignature(node) {
        if (node.key.type !== "Identifier") return;
        if (!isBareNumber(node.typeAnnotation?.typeAnnotation)) return;
        if (!insideExportedType(node)) return;

        const name = node.key.name;
        if (dimensionless.has(name)) return;
        if (dimensionlessSuffixes.some((s) => name.endsWith(s) && name !== s)) return;
        if (suffixes.some((s) => name.endsWith(s) && name !== s)) return;

        context.report({
          node: node.key,
          messageId: "missing",
          data: { name, suffixes: suffixes.join(", ") },
        });
      },
    };
  },
};
