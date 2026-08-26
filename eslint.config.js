import js from "@eslint/js";
import tseslint from "typescript-eslint";
import soarwx from "./tools/eslint-plugin-soarwx/index.js";

/** Directorios cuyas funciones exportadas deben citar su fuente (NF-6). */
const PHYSICS_GLOBS = [
  "src/thermo/**/*.ts",
  "src/convection/**/*.ts",
  "src/clouds/**/*.ts",
  "src/stability/**/*.ts",
  "src/orographic/**/*.ts",
];

export default tseslint.config(
  // `test/docs/examples/` lo genera `tools/checkApiExamples.ts` desde los bloques
  // de código de `docs/API.md`. No se lintan: lo que interesa de ellos es que
  // **compilen**, y de eso se encarga `pnpm typecheck`.
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".claude/**",
      ".gstack/**",
      "test/docs/examples/**",
      // Script suelto del generador de documentación: no entra en el tsconfig
      // del paquete, así que tampoco en el linter con tipos.
      "tools/api-docs/*.mjs",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { soarwx },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: "Prohibido `as any`.",
        },
      ],
    },
  },

  // La librería debe funcionar en navegador y en Node sin build específico
  // (NF-3): nada de APIs exclusivas de Node en `src/`.
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "url", "crypto"],
              message: "`src/` debe funcionar en navegador: nada de APIs de Node (NF-3).",
            },
          ],
        },
      ],
    },
  },

  // El núcleo no toca la red. Solo `src/openmeteo/` puede.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/openmeteo/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Solo `src/openmeteo/` accede a la red (SPEC §13)." },
        { name: "XMLHttpRequest", message: "Solo `src/openmeteo/` accede a la red." },
      ],
    },
  },

  // NF-6: cita obligatoria en los módulos de física.
  {
    files: PHYSICS_GLOBS,
    rules: { "soarwx/require-source-citation": "error" },
  },

  // NF-5: sufijo de unidad en toda propiedad `number` de un tipo exportado.
  {
    files: ["src/**/*.ts"],
    rules: { "soarwx/unit-suffix": "error" },
  },

  // Única excepción: los tipos que describen la respuesta de Open-Meteo tal
  // como llega. Esos nombres son suyos, no nuestros, y renombrarlos rompería
  // la correspondencia con el JSON. La conversión a unidades internas y a tipos
  // marcados ocurre en `normalize.ts`, que sí cumple la regla.
  {
    files: ["src/openmeteo/types.ts"],
    rules: { "soarwx/unit-suffix": "off" },
  },

  // El plugin de lint y su suite son JavaScript: sin type-checking.
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },

  // En las pruebas, `!` tras una aserción previa es idiomático y seguro: la
  // precondición ya se ha comprobado con `expect`.
  {
    files: ["test/**/*.ts", "tools/**/*.js"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
