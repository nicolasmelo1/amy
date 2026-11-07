// L0.THE_SERVICES_KEEP_NO_DATABASE: the ports are the truth. No driver or ORM
// under packages/services, no filesystem outside a repository, no file
// adapter named in a domain, and a repository awaits every port call so a
// port answering over a network changes no domain
// (docs/design/amy-speaks-in-domains.md).
import path from "node:path";
import ts from "typescript";
import { domainOf, importsOf, partOf, portBindings, portNamedBy, portNames, report, services, sourcesUnder, type Source } from "./read.js";

const DRIVERS = /^(better-sqlite3|sqlite3|pg|mysql2|prisma|@prisma\/client|drizzle-orm|typeorm|knex|level|lmdb)(\/|$)/;
const FILESYSTEM = /^(node:)?fs(\/promises)?$/;
const FILE_ADAPTERS = new Set(["FileStore", "FileQueue", "FileEventLog", "FileStopSwitch", "PAUSED"]);
const findings: string[] = [];
const ports = portNames();

for (const source of sourcesUnder(services)) {
  for (const one of importsOf(source)) {
    if (DRIVERS.test(one.specifier)) findings.push(`${source.file} imports \`${one.specifier}\`: amy ships no database; state kept elsewhere is an adapter behind a port`);
  }
}

for (const source of sourcesUnder(path.join(services, "src"))) {
  const inDomain = domainOf(source.absolute) !== undefined;
  const part = partOf(source.absolute);
  for (const one of importsOf(source)) {
    if (FILESYSTEM.test(one.specifier) && part !== "repositories") {
      findings.push(`${source.file} imports \`${one.specifier}\`: only a repository touches what a port persists, and it does so through the port`);
    }
    if (inDomain && (one.specifier.startsWith("@amykit/plugin-file-") || one.names.some((name) => FILE_ADAPTERS.has(name)))) {
      findings.push(`${source.file} names a file adapter (\`${one.specifier}\`): a domain is handed the port's interface, never the adapter behind it`);
    }
  }
  if (part === "repositories") checkAwaits(source);
}

/** Every call on a field or parameter typed as a port is awaited. */
function checkAwaits(source: Source): void {
  const held = portHolders(source);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const holder = holderName(node.expression.expression);
      if (holder !== undefined && held.has(holder) && !isAwaited(node)) {
        findings.push(`${source.file}:${line(source.ast, node)} calls \`${node.expression.getText(source.ast)}\` without awaiting it: a repository awaits every port call, synchronous or not`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source.ast);
}

/** The names of parameters, properties and variables whose declared type is a port, however the port was imported. */
function portHolders(source: Source): Set<string> {
  const bindings = portBindings(source, ports);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isParameter(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) && node.type && ts.isIdentifier(node.name)) {
      if (ts.isTypeReferenceNode(node.type) && portNamedBy(node.type.typeName, bindings, ports) !== undefined) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source.ast);
  return names;
}

function holderName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) return node.name.text;
  return undefined;
}

function isAwaited(node: ts.Node): boolean {
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return ts.isAwaitExpression(parent);
}

function line(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

report("L0.THE_SERVICES_KEEP_NO_DATABASE", findings);
