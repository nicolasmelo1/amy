// What the services' gates read: every source file under a tree's
// packages/services, as the TypeScript compiler parses it. Each gate runs from
// the root of the tree it judges — the repository, or a mutation fixture —
// and reads the core's ports from the repository it lives in.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const root = process.cwd();
export const services = path.join(root, "packages/services");
export const domainsDir = path.join(services, "src/domains");
/** The repository this gate lives in, wherever the tree it judges sits. */
export const repository = path.resolve(import.meta.dirname, "../../..");

export interface Source {
  /** Relative to the tree's root, with forward slashes. */
  readonly file: string;
  readonly absolute: string;
  readonly ast: ts.SourceFile;
}

export interface Import {
  readonly specifier: string;
  /** The names it binds, `*` for a namespace, empty for a bare import. */
  readonly names: readonly string[];
}

/** Every extension the TypeScript build accepts as a source: .ts, .tsx, .mts and .cts. */
const SOURCE = /\.(ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.(ts|mts|cts)$/;

/** Every TypeScript source under a directory, skipping what a build or an install wrote. */
export function sourcesUnder(directory: string): Source[] {
  if (!fs.existsSync(directory)) return [];
  const found: Source[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") found.push(...sourcesUnder(absolute));
    } else if (SOURCE.test(entry.name) && !DECLARATION.test(entry.name)) {
      found.push(parse(absolute));
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

export function parse(absolute: string): Source {
  const text = fs.readFileSync(absolute, "utf8");
  return {
    file: path.relative(root, absolute).split(path.sep).join("/"),
    absolute,
    ast: ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS),
  };
}

/** Every module a file reaches: static imports, re-exports, `import()` and `require()`. */
export function importsOf(source: Source): Import[] {
  const found: Import[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, names: boundNames(node.importClause) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map((one) => (one.propertyName ?? one.name).text) : ["*"];
      found.push({ specifier: node.moduleSpecifier.text, names });
    } else if (ts.isCallExpression(node) && isDynamicLoad(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      found.push({ specifier: node.arguments[0].text, names: ["*"] });
    }
    ts.forEachChild(node, visit);
  };
  visit(source.ast);
  return found;
}

function boundNames(clause: ts.ImportClause | undefined): string[] {
  if (!clause) return [];
  const names: string[] = clause.name ? ["default"] : [];
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push("*");
  if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map((one) => (one.propertyName ?? one.name).text));
  return names;
}

function isDynamicLoad(node: ts.CallExpression): boolean {
  return node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require");
}

/** Where a relative import lands, as an absolute path without its extension. */
export function landsAt(source: Source, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  return path.resolve(path.dirname(source.absolute), specifier).replace(/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/, "");
}

/** One domain folder: its name and where it is. */
export interface Domain {
  readonly name: string;
  readonly directory: string;
}

export function domains(): Domain[] {
  if (!fs.existsSync(domainsDir)) return [];
  return fs
    .readdirSync(domainsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, directory: path.join(domainsDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The domain a path sits in, if it sits in one. */
export function domainOf(absolute: string): string | undefined {
  const relative = path.relative(domainsDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep)[0];
}

/** The part of a domain a path sits in: `operations`, `services`, `repositories`, or a file at its root. */
export function partOf(absolute: string): string | undefined {
  const relative = path.relative(domainsDir, absolute);
  if (relative.startsWith("..")) return undefined;
  return relative.split(path.sep)[1];
}

/**
 * Every port the core declares: an exported interface or class under
 * packages/core/src/ports with something to call. Read from the repository
 * the gate lives in, so a fixture is judged against today's ports. A plain
 * value beside a port — a view, a result — is data, and any file may name it.
 */
export function portNames(): Set<string> {
  const names = new Set<string>();
  for (const source of sourcesUnder(path.join(repository, "packages/core/src/ports"))) {
    for (const statement of source.ast.statements) {
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
      if (exported && (ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name && hasSomethingToCall(statement)) {
        names.add(statement.name.text);
      }
    }
  }
  return names;
}

function hasSomethingToCall(declaration: ts.InterfaceDeclaration | ts.ClassDeclaration): boolean {
  return (declaration.members as ts.NodeArray<ts.Node>).some(
    (member) =>
      ts.isMethodSignature(member) ||
      ts.isMethodDeclaration(member) ||
      ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && member.type !== undefined && ts.isFunctionTypeNode(member.type)),
  );
}

/** How a file binds the core's ports: local names for each port, and namespaces over the core. */
export interface PortBindings {
  /** Local name → the port it is, aliases included. */
  readonly named: ReadonlyMap<string, string>;
  /** Local names of `import * as x from "@amykit/core"`. */
  readonly namespaces: ReadonlySet<string>;
  /** Lines that load the core with `import()` or `require()`, whose exports nothing can see. */
  readonly dynamic: readonly number[];
}

export function portBindings(source: Source, ports: ReadonlySet<string>): PortBindings {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();
  const dynamic: number[] = [];
  const visit = (node: ts.Node): void => {
    if (isCoreImport(node)) bindImport(node, ports, named, namespaces);
    else if (isCoreLoad(node)) dynamic.push(source.ast.getLineAndCharacterOfPosition(node.getStart(source.ast)).line + 1);
    ts.forEachChild(node, visit);
  };
  visit(source.ast);
  return { named, namespaces, dynamic };
}

function isCoreImport(node: ts.Node): node is ts.ImportDeclaration {
  return ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@amykit/core";
}

function isCoreLoad(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || !isDynamicLoad(node)) return false;
  const first = node.arguments[0];
  return first !== undefined && ts.isStringLiteralLike(first) && first.text === "@amykit/core";
}

function bindImport(node: ts.ImportDeclaration, ports: ReadonlySet<string>, named: Map<string, string>, namespaces: Set<string>): void {
  const bindings = node.importClause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
  if (!bindings || !ts.isNamedImports(bindings)) return;
  for (const one of bindings.elements) {
    const imported = (one.propertyName ?? one.name).text;
    if (ports.has(imported)) named.set(one.name.text, imported);
  }
}

/** The port a type or value reference names — `Store`, `NoteStore` aliased to it, or `core.Store` — if any. */
export function portNamedBy(node: ts.Node, bindings: PortBindings, ports: ReadonlySet<string>): string | undefined {
  if (ts.isIdentifier(node)) return bindings.named.get(node.text);
  const left = ts.isQualifiedName(node) ? node.left : ts.isPropertyAccessExpression(node) ? node.expression : undefined;
  const right = ts.isQualifiedName(node) ? node.right : ts.isPropertyAccessExpression(node) ? node.name : undefined;
  if (!left || !right || !ts.isIdentifier(left) || !ts.isIdentifier(right)) return undefined;
  return bindings.namespaces.has(left.text) && ports.has(right.text) ? right.text : undefined;
}

/** Prints the findings and sets the exit code: the shape every gate answers in. */
export function report(rule: string, findings: readonly string[]): void {
  if (findings.length === 0) {
    console.log(`${rule}: nothing to report`);
    return;
  }
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
}
