/**
 * Exige que toda función exportada de los módulos de física lleve la cita de su
 * fuente en el docblock: `@source Autor (año), ecuación N`.
 *
 * Regla de `docs/REQUIREMENTS.md` NF-6: sin cita, la fórmula no entra.
 * Se activa solo sobre los directorios que la configuración le indique.
 */

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Las funciones exportadas de los módulos de física deben citar su fuente con @source.",
    },
    schema: [
      {
        type: "object",
        properties: { tag: { type: "string" } },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        "`{{name}}` no cita su fuente. Añade `{{tag}} Autor (año), ecuación N` al docblock (NF-6).",
    },
  },

  create(context) {
    const tag = context.options[0]?.tag ?? "@source";
    const source = context.sourceCode;

    /** @param {import("estree").Node} node @param {string} name */
    function check(node, name) {
      const cited = source
        .getCommentsBefore(node)
        .some((c) => c.type === "Block" && c.value.includes(tag));
      if (!cited) {
        context.report({ node, messageId: "missing", data: { name, tag } });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        if (decl.type === "FunctionDeclaration" && decl.id) {
          check(node, decl.id.name);
          return;
        }

        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            const init = d.init;
            const isFn =
              init &&
              (init.type === "ArrowFunctionExpression" ||
                init.type === "FunctionExpression");
            if (isFn && d.id.type === "Identifier") check(node, d.id.name);
          }
        }
      },
    };
  },
};
