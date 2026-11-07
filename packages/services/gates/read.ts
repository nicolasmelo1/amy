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

/** Every .ts file under a directory, skipping what a build or an install wrote. */
export function sourcesUnder(directory: string): Source[] {
  if (!fs.existsSync(directory)) return [];
  const found: Source[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") found.push(...sourcesUnder(absolute));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
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
    ast: ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
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
  return path.resolve(path.dirname(source.absolute), specifier).replace(/\.(js|ts)$/, "");
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
 * Every name the core's ports export: what a repository wraps and nothing
 * else in a domain may name. Read from the repository the gate lives in, so a
 * fixture is judged against today's ports.
 */
export function portNames(): Set<string> {
  const names = new Set<string>();
  for (const source of sourcesUnder(path.join(repository, "packages/core/src/ports"))) {
    for (const statement of source.ast.statements) {
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
      const named = ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement);
      if (exported && named && statement.name) names.add(statement.name.text);
    }
  }
  return names;
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
