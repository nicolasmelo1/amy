import ts from "typescript";
import { read } from "../lib/repo.mjs";

const FILE = "packages/cli/src/config.ts";

/**
 * The host's own configuration, from the interface that defines it.
 *
 * A plugin declares its settings as data and the host validates them; the
 * host's own block is a TypeScript interface, so it is read as one. The
 * annotated example beside it is the template `amy init` writes, taken from
 * the same file rather than retyped — a documented example that differs from
 * the one the command produces is worse than none.
 */
export function configFacts() {
  const source = ts.createSourceFile(FILE, read(FILE), ts.ScriptTarget.ES2022, true);

  return {
    fields: fieldsOf(source, "AmyConfig"),
    profile: fieldsOf(source, "WorkflowProfile"),
    defaults: defaultsOf(source),
    example: stringConstant(source, "EXAMPLE_CONFIG"),
    exampleRoster: stringConstant(source, "EXAMPLE_ROSTER"),
  };
}

function fieldsOf(source, name) {
  const found = [];

  visit(source, (node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== name) return;

    for (const member of node.members) {
      if (!ts.isPropertySignature(member)) continue;

      found.push({
        name: member.name.getText(source),
        type: member.type.getText(source).replace(/\s+/g, " "),
        optional: member.questionToken !== undefined,
        doc: docOf(member, source),
      });
    }
  });

  return found;
}

/** The literal each field falls back to, so the reference can say so. */
function defaultsOf(source) {
  const defaults = {};

  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (node.name.getText(source) !== "DEFAULT_CONFIG") return;
    if (!node.initializer || !ts.isObjectLiteralExpression(node.initializer)) return;

    for (const property of node.initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      defaults[property.name.getText(source)] = property.initializer
        .getText(source)
        .replace(/\s+/g, " ");
    }
  });

  return defaults;
}

function stringConstant(source, name) {
  let value = "";

  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (node.name.getText(source) !== name) return;
    if (!node.initializer) return;

    if (ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer)) {
      // The template is escaped for TypeScript, not for a reader.
      value = node.initializer.text.replace(/\\`/g, "`").replace(/\\\$/g, "$");
    }
  });

  return value;
}

function visit(node, seen) {
  seen(node);
  node.forEachChild((child) => visit(child, seen));
}

function docOf(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.getFullText(), node.getFullStart()) ?? [];

  for (const range of ranges.reverse()) {
    const text = source.getFullText().slice(range.pos, range.end);
    if (!text.startsWith("/**")) continue;

    return text
      .replace(/^\/\*\*/, "")
      .replace(/\*\/$/, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
      .join("\n")
      .trim()
      .split(/\n\s*\n/)[0]
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}
