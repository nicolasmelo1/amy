import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, read, readJson } from "../lib/repo.mjs";

/**
 * What the core ships, read from the core.
 *
 * The action catalogue and the event contract are already data, so they are
 * read as data. The ports are TypeScript interfaces, so they are parsed —
 * importing them would give the shape at run time, which for an interface is
 * nothing at all.
 */
export function coreFacts() {
  return {
    actions: actions(),
    ports: ports(),
    events: events(),
    plans: planKinds(),
  };
}

/** The action catalogue, with the port and method each one dispatches to. */
function actions() {
  const source = parse("packages/core/src/actions.ts");
  const found = [];

  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (node.name.getText(source) !== "CORE_ACTIONS") return;

    const literal = unwrapAs(node.initializer);
    if (!literal || !ts.isObjectLiteralExpression(literal)) return;

    for (const property of literal.properties) {
      if (!ts.isPropertyAssignment(property)) continue;

      const name = stringOf(property.name, source);
      const spec = {};
      if (ts.isObjectLiteralExpression(property.initializer)) {
        for (const field of property.initializer.properties) {
          if (!ts.isPropertyAssignment(field)) continue;
          spec[field.name.getText(source)] = stringOf(field.initializer, source);
        }
      }

      found.push({ name, port: spec.port, method: spec.method, doc: docOf(property, source) });
    }
  });

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One entry per contract in `packages/core/src/ports`.
 *
 * The methods are what an implementation has to provide, so they are carried
 * with their signatures. What is deliberately *not* derived here is the name
 * a contract is mounted under: `Harness` mounts as `agent`, and `EventLog` is
 * not mounted at all. Guessing that from the file name would put a false
 * statement in a reference table, so the mounted kind is joined on later from
 * what the shipped plugins actually mount.
 */
function ports() {
  const directory = path.join(ROOT, "packages/core/src/ports");
  const found = [];

  for (const entry of fs.readdirSync(directory).sort()) {
    if (!entry.endsWith(".ts")) continue;

    const relative = `packages/core/src/ports/${entry}`;
    const source = parse(relative);

    visit(source, (node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      if (!isExported(node)) return;
      if (node.members.filter(ts.isMethodSignature).length === 0) return;

      found.push({
        interface: node.name.text,
        file: relative,
        doc: docOf(node, source),
        methods: node.members.filter(ts.isMethodSignature).map((method) => ({
          name: method.name.getText(source),
          signature: signatureOf(method, source),
          doc: docOf(method, source),
        })),
      });
    });
  }

  return found.sort((a, b) => a.interface.localeCompare(b.interface));
}

function isExported(node) {
  return (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

/** Every event kind, from the contract the log is validated against. */
function events() {
  const contract = readJson("packages/core/events.json");
  const meanings = kindMeanings();

  return Object.entries(contract.kinds)
    .map(([kind, declared]) => ({
      kind,
      says: declared.says,
      requires: declared.requires ?? [],
      detail: Object.entries(declared.detail ?? {}).map(([field, type]) => ({ field, type })),
      summary: meanings[kind] ?? "",
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** The one-line summary each kind carries in the union the compiler holds. */
function kindMeanings() {
  const source = parse("packages/core/src/ports/EventLog.ts");
  const meanings = {};

  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (node.name.getText(source) !== "EVENT_KINDS") return;

    const literal = unwrapAs(node.initializer);
    if (!literal || !ts.isObjectLiteralExpression(literal)) return;

    for (const property of literal.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      meanings[stringOf(property.name, source)] = stringOf(property.initializer, source);
    }
  });

  return meanings;
}

/** The four things a decision can be, with the comment that says when. */
function planKinds() {
  const source = parse("packages/core/src/work.ts");
  const found = [];

  visit(source, (node) => {
    if (!ts.isTypeAliasDeclaration(node)) return;
    if (node.name.text !== "Plan") return;
    if (!ts.isUnionTypeNode(node.type)) return;

    for (const member of node.type.types) {
      if (!ts.isTypeLiteralNode(member)) continue;

      const kind = member.members
        .filter(ts.isPropertySignature)
        .find((property) => property.name.getText(source) === "kind");

      found.push({
        kind: kind ? stripQuotes(kind.type.getText(source)) : "",
        fields: member.members
          .filter(ts.isPropertySignature)
          .map((property) => `${property.name.getText(source)}: ${property.type.getText(source)}`),
        // Not `docOf`: a union member's comment sits before the `|`, which is
        // outside the trivia the compiler attaches to the member itself.
        doc: docBefore(source.getFullText(), member.getStart(source)),
      });
    }
  });

  return found;
}

function parse(relative) {
  return ts.createSourceFile(
    relative,
    read(relative),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
}

function visit(node, seen) {
  seen(node);
  node.forEachChild((child) => visit(child, seen));
}

/** `{ ... } as const` and `{ ... } satisfies T` both hide the literal. */
function unwrapAs(node) {
  let current = node;
  while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

function stringOf(node, source) {
  return stripQuotes(node.getText(source));
}

function stripQuotes(text) {
  return text.replace(/^["'`]|["'`]$/g, "");
}

/**
 * The doc comment above a node, as one paragraph.
 *
 * The first paragraph only: the rest of a doc comment in this repository is
 * the argument for the decision, which belongs in the prose beside the table
 * rather than inside a cell of it.
 */
function docOf(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.getFullText(), node.getFullStart()) ?? [];

  for (const range of ranges.reverse()) {
    const text = source.getFullText().slice(range.pos, range.end);
    if (text.startsWith("/**")) return cleanComment(text);
  }

  return "";
}

/**
 * A doc comment as one paragraph.
 *
 * The first paragraph only: the rest of a doc comment in this repository is
 * the argument for the decision, which belongs in the prose beside the table
 * rather than inside a cell of it.
 */
function cleanComment(text) {
  const cleaned = text
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();

  return cleaned.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
}

/**
 * The doc comment ending just before a position, skipping `|` and whitespace.
 *
 * The compiler attaches trivia to the node it precedes, and a union member is
 * preceded by its separator rather than by its comment, so the comment above
 * `| { kind: "act" ... }` belongs to nothing the walker can ask.
 */
function docBefore(text, start) {
  let cursor = start - 1;
  while (cursor >= 0 && /[\s|]/.test(text[cursor])) cursor -= 1;

  if (cursor < 1 || text.slice(cursor - 1, cursor + 1) !== "*/") return "";

  const open = text.lastIndexOf("/**", cursor);
  if (open === -1) return "";

  return cleanComment(text.slice(open, cursor + 1));
}

function signatureOf(method, source) {
  const parameters = method.parameters
    .map((parameter) => parameter.getText(source).replace(/\s+/g, " "))
    .join(", ");
  const returns = method.type ? `: ${method.type.getText(source).replace(/\s+/g, " ")}` : "";
  return `${method.name.getText(source)}(${parameters})${returns}`;
}
