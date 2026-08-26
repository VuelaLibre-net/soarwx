/**
 * Requires every exported function in physics modules to cite its source
 * in the docblock: `@source Author (year), equation N`.
 *
 * Rule from `docs/REQUIREMENTS.md` NF-6: uncited formulas do not merge.
 * Only applies to directories specified by configuration.
 */

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exported functions in physics modules must cite their source with @source.",
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
        "`{{name}}` does not cite its source. Add `{{tag}} Author (year), equation N` to the docblock (NF-6).",
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
