/**
 * Requires every numeric property in an exported type to carry a unit suffix.
 *
 * Rule from `docs/SPEC.md` §2 and `docs/REQUIREMENTS.md` NF-5. The predecessor's
 * history is full of unit errors (km/h treated as knots, IAS treated as ground
 * speed). The suffix ensures unit mismatches fail during review and compilation.
 *
 * Branded types (`Kelvin`, `Metres`, ...) do not trigger the rule: only bare
 * `number` is checked.
 */

const DEFAULT_SUFFIXES = [
  "K", // kelvin
  "Pa", // pascal
  "M", // metre
  "Ms", // metre/second
  "Deg", // degree
  "Wm2", // watt/metre²
  "Jkg", // joule/kilogram
  "KgKg", // kg/kg
  "KMs", // kelvin·metre/second (kinematic flux)
  "Frac", // fraction 0..1
  "Hpa", // hectopascal (only in input adapters)
  "MsPerKm", // shear
  "KPerM", // lapse rate
  "Utc", // ISO timestamp
  "Seconds",
  "Ms2", // metre/second²
  "KgM3", // kilogram/metre³
  "PerM2", // metre⁻² (Scorer parameter)
  "PerS2", // second⁻² (Brunt-Väisälä frequency squared)
  "Hours", // hours
  "Km", // kilometre
  "Days", // days
  "Px", // pixel (only in render canvas)
];

/**
 * Suffixes that denote dimensionless quantities by their nature:
 * counts, indices and ratios. Prevents unbounded list growth.
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

/** Explicitly dimensionless names. Configurable. */
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
      description: "Numeric properties of exported types must carry a unit suffix.",
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
        "`{{name}}` is a `number` without a unit suffix. Use one of: {{suffixes}} — or a branded type (SPEC §2).",
    },
  },

  create(context) {
    const opts = context.options[0] ?? {};
    const suffixes = opts.suffixes ?? DEFAULT_SUFFIXES;
    const dimensionless = new Set(opts.dimensionless ?? DEFAULT_DIMENSIONLESS);
    const dimensionlessSuffixes =
      opts.dimensionlessSuffixes ?? DEFAULT_DIMENSIONLESS_SUFFIXES;

    /** Is the annotation `number` or a union containing it? */
    function isBareNumber(annotation) {
      if (!annotation) return false;
      if (annotation.type === "TSNumberKeyword") return true;
      if (annotation.type === "TSUnionType") {
        return annotation.types.some((t) => t.type === "TSNumberKeyword");
      }
      return false;
    }

    /** Is the node inside an exported type declaration? */
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
