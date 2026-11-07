// L0.THE_SERVICES_KEEP_THEIR_DOMAINS: each domain keeps its layout, an
// operation file exports its operation and nothing else, no domain reads
// another, only a repository names a port, and no transport is imported
// anywhere under packages/services (docs/design/amy-speaks-in-domains.md).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { domainOf, domains, importsOf, landsAt, partOf, portNames, report, services, sourcesUnder, type Source } from "./read.js";

const REQUIRED = ["operations", "services", "exceptions.ts", "index.ts"];
const TRANSPORTS = /^(commander|hono|express|fastify|koa|ws|node:(http|https|http2|net)|http|https|http2|net)(\/|$)/;
const findings: string[] = [];
const ports = portNames();

for (const domain of domains()) {
  for (const part of REQUIRED) {
    if (!fs.existsSync(path.join(domain.directory, part))) findings.push(`domain \`${domain.name}\` has no ${part}: every domain keeps operations/, services/, exceptions.ts and index.ts`);
  }
}

for (const source of sourcesUnder(services)) {
  for (const one of importsOf(source)) {
    if (TRANSPORTS.test(one.specifier)) findings.push(`${source.file} imports \`${one.specifier}\`: a transport belongs to its door, never to the services`);
  }
  const domain = domainOf(source.absolute);
  if (domain === undefined) continue;
  const part = partOf(source.absolute);
  checkImports(source, domain, part);
  if (part === "operations") checkOperationExports(source);
}

function checkImports(source: Source, domain: string, part: string | undefined): void {
  for (const one of importsOf(source)) {
    const target = landsAt(source, one.specifier);
    if (target !== undefined) checkReach(source, one.specifier, target, domain, part);
    if ((part === "operations" || part === "services") && one.specifier === "@amykit/core") checkPorts(source, one.names);
  }
}

/** A relative import stays in its own domain, and a service never reaches an operation. */
function checkReach(source: Source, specifier: string, target: string, domain: string, part: string | undefined): void {
  const reached = domainOf(target);
  if (reached !== undefined && reached !== domain) {
    findings.push(`${source.file} imports \`${specifier}\` from domain \`${reached}\`: domain \`${domain}\` reads no other domain, it reads the record through its own repository`);
  }
  if (part === "services" && reached === domain && partOf(target) === "operations") {
    findings.push(`${source.file} imports the operation \`${specifier}\`: a service is called by an operation, never the other way`);
  }
}

function checkPorts(source: Source, names: readonly string[]): void {
  for (const name of names.filter((imported) => ports.has(imported))) {
    findings.push(`${source.file} imports the port \`${name}\`: only a repository reaches a port`);
  }
}

function checkOperationExports(source: Source): void {
  const exported = exportsOf(source.ast);
  const operations = exported.filter((one) => one.isOperation);
  for (const one of exported.filter((candidate) => !candidate.isOperation)) {
    findings.push(`${source.file} exports \`${one.name}\`: an operation file exports its operation and nothing else, its schemas and types included`);
  }
  if (operations.length !== 1) findings.push(`${source.file} exports ${operations.length} operations: an operation file declares exactly one`);
}

function exportsOf(file: ts.SourceFile): { name: string; isOperation: boolean }[] {
  const found: { name: string; isOperation: boolean }[] = [];
  for (const statement of file.statements) {
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        found.push({ name: declaration.name.getText(file), isOperation: isDefineOperation(declaration.initializer) });
      }
    } else if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      found.push({ name: statement.getText(file), isOperation: false });
    } else if (exported && "name" in statement && statement.name) {
      found.push({ name: (statement.name as ts.Identifier).text, isOperation: false });
    }
  }
  return found;
}

function isDefineOperation(node: ts.Expression | undefined): boolean {
  return node !== undefined && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineOperation";
}

report("L0.THE_SERVICES_KEEP_THEIR_DOMAINS", findings);
