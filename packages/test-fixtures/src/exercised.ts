import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * The public methods one class declares, read from its source rather than
 * restated in a list: a contract restated is a contract that can disagree
 * with the one it restates. Private, protected and static members are not
 * the port's, and neither is the constructor.
 */
export function publicMethodsOf(source: string, className: string): string[] {
  const file = ts.createSourceFile("adapter.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!declaration) throw new Error(`no class ${className} in the source given`);

  const hidden = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.StaticKeyword];
  return declaration.members.flatMap((member) => {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) return [];
    if (member.modifiers?.some((modifier) => hidden.includes(modifier.kind))) return [];
    return [member.name.text];
  });
}

/**
 * The public methods of `className` that no test source calls.
 *
 * A call is a call expression on a property of that name in a parsed test
 * source — `host.reviewLoad(...)`, the shape every adapter test takes. A
 * method named in a string or a comment and never called does not count,
 * which is the point: something has to run it.
 */
export function unexercisedMethods(
  source: string,
  className: string,
  testSources: readonly string[],
): string[] {
  const called = new Set(testSources.flatMap(calledProperties));
  return publicMethodsOf(source, className).filter((method) => !called.has(method));
}

function calledProperties(source: string): string[] {
  const file = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      names.push(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/**
 * Every `*.test.ts` under one directory, except the files named — the
 * guardrail's own file is excluded, or it would count its own mentions as
 * proof.
 */
export function testSourcesIn(directory: string, except: readonly string[] = []): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".test.ts") && !except.some((name) => file.endsWith(name)))
    .map((file) => readFileSync(join(directory, file), "utf8"));
}
