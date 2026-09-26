import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

/**
 * The public methods one class declares, read from its source rather than
 * restated in a list: a contract restated is a contract that can disagree
 * with the one it restates. Private, protected and static members are not
 * the port's, and neither is the constructor.
 */
export function publicMethodsOf(source: string, className: string): string[] {
  const file = ts.createSourceFile("adapter.ts", source, ts.ScriptTarget.Latest, true);
  return publicMethodDeclarations(file, className).map((member) => (member.name as ts.Identifier).text);
}

function publicMethodDeclarations(file: ts.SourceFile, className: string): ts.MethodDeclaration[] {
  const declaration = file.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!declaration) throw new Error(`no class ${className} in ${file.fileName}`);

  const hidden = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.StaticKeyword];
  return declaration.members.filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      !member.modifiers?.some((modifier) => hidden.includes(modifier.kind)),
  );
}

export interface ExerciseQuestion {
  /** The adapter's source file. */
  adapter: string;
  className: string;
  /** The test files whose calls count. */
  tests: readonly string[];
  /** The tsconfig the tests type-check under, so imports resolve as they do in the suite. */
  tsconfig: string;
  /** Rewrites a file's text as it is read — how a test asks "what if this call were gone". */
  rewrite?: (file: string, text: string) => string;
}

/**
 * The public methods of the adapter that no test calls.
 *
 * A call counts when the type checker resolves it to *that* method
 * declaration, on that class, in that file — `host.reviewLoad(...)` on a
 * `GitHubCodeHost`. A method of the same name on some other object, or a
 * method named in a string or a comment, does not count, which is the point:
 * something has to run this one.
 */
export function unexercisedMethods(question: ExerciseQuestion): string[] {
  const adapter = resolve(question.adapter);
  const program = programFor(question);
  const checker = program.getTypeChecker();

  const source = program.getSourceFile(adapter);
  if (!source) throw new Error(`${adapter} is not part of the program the tests make`);
  const declarations = publicMethodDeclarations(source, question.className);

  const called = new Set<ts.Declaration>();
  for (const test of question.tests) {
    const file = program.getSourceFile(resolve(test));
    if (!file) throw new Error(`${test} is not part of the program`);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        for (const declaration of checker.getSymbolAtLocation(node.expression.name)?.declarations ?? []) {
          called.add(declaration);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  return declarations
    .filter((declaration) => !called.has(declaration))
    .map((declaration) => (declaration.name as ts.Identifier).text);
}

function programFor(question: ExerciseQuestion): ts.Program {
  const config = ts.readConfigFile(question.tsconfig, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(question.tsconfig, ".."));

  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const rewrite = question.rewrite;
  if (rewrite) {
    const read = host.readFile.bind(host);
    host.readFile = (file) => {
      const text = read(file);
      return text === undefined ? undefined : rewrite(resolve(file), text);
    };
  }
  return ts.createProgram({ rootNames: [resolve(question.adapter), ...question.tests.map((test) => resolve(test))], options, host });
}

/**
 * Every `*.test.ts` under one directory, except the files named — the
 * guardrail's own file is excluded, or it would count its own calls as proof.
 */
export function testFilesIn(directory: string, except: readonly string[] = []): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".test.ts") && !except.some((name) => file.endsWith(name)))
    .map((file) => join(directory, file));
}
