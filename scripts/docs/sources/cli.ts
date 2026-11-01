import ts from "typescript";
import { read } from "../lib/repo.js";
import type { CliCommand, CliFacts, CliOption } from "../lib/facts.js";

interface Chain {
  variable: string | null;
  call: ts.CallExpression;
}

interface ChainCall {
  name: string;
  args: ts.NodeArray<ts.Expression>;
}

/** What a chain describes when it declares no command: the program itself. */
interface Described {
  description: string;
  options: CliOption[];
}

const ENTRY = "packages/cli/src/index.ts";

/**
 * Every command the CLI declares, read out of the declaration.
 *
 * Not out of `--help`: importing the CLI parses argv and exits, and scraping
 * its help output would mean parsing a layout that exists to be read by a
 * person. The commander chain in the source is already the structured form of
 * the same thing, so it is what gets read.
 */
export function cliFacts(): CliFacts {
  const source = ts.createSourceFile(ENTRY, read(ENTRY), ts.ScriptTarget.ES2022, true);

  const commands: CliCommand[] = [];
  const globals: Described = { description: "", options: [] };
  const paths = new Map<string | null, string[]>([["program", []]]);

  for (const statement of source.statements) {
    for (const { variable, call } of chainsIn(statement, source)) {
      const chain = flatten(call);
      const base = paths.get(chain.root);
      if (base === undefined) continue;

      const ended = apply(base, chain.calls, source, commands, globals);
      if (variable) paths.set(variable, ended);
    }
  }

  return {
    name: "amy",
    description: globals.description,
    options: globals.options,
    commands: commands.sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" "))),
  };
}

/** The call chains a top-level statement holds, with the name it is bound to. */
function chainsIn(statement: ts.Statement, source: ts.SourceFile): Chain[] {
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
    return [{ variable: null, call: statement.expression }];
  }

  if (!ts.isVariableStatement(statement)) return [];

  return statement.declarationList.declarations.flatMap((declaration) =>
    declaration.initializer && ts.isCallExpression(declaration.initializer)
      ? [{ variable: declaration.name.getText(source), call: declaration.initializer }]
      : [],
  );
}

/** `a.b().c()` as the root identifier plus the calls, in the order written. */
function flatten(call: ts.CallExpression): { root: string | null; calls: ChainCall[] } {
  const calls: ChainCall[] = [];
  let current: ts.Expression = call;

  while (ts.isCallExpression(current)) {
    const callee = current.expression;
    if (!ts.isPropertyAccessExpression(callee)) break;

    calls.unshift({ name: callee.name.text, args: current.arguments });
    current = callee.expression;
  }

  return { root: ts.isIdentifier(current) ? current.text : null, calls };
}

/**
 * Folds one chain into the command list, and says where it ended up.
 *
 * A chain may declare a command and then describe it, or may describe one
 * declared earlier and held in a variable. The returned path is what a
 * variable bound to this chain names, which is how `roster show` is found
 * from `const rosterCommand = program.command("roster")`.
 */
function apply(
  base: string[],
  calls: ChainCall[],
  source: ts.SourceFile,
  commands: CliCommand[],
  globals: Described,
): string[] {
  let path = base;
  let current: CliCommand | null = commands.find((command) => same(command.path, path)) ?? null;

  for (const { name, args } of calls) {
    if (name === "command") {
      path = [...path, literal(args[0], source)];
      current = {
        path,
        description: "",
        arguments: [],
        options: [],
        isDefault: hasFlag(args[1], source, "isDefault"),
        hidden: hasFlag(args[1], source, "hidden"),
      };
      commands.push(current);
      continue;
    }

    const target: Described = current ?? globals;

    if (name === "description") target.description = literal(args[0], source);

    if (name === "argument" && current) {
      const spec = literal(args[0], source);
      current.arguments.push({
        name: spec,
        required: spec.startsWith("<"),
        description: literal(args[1], source),
      });
    }

    if (name === "option") {
      target.options.push({
        flags: literal(args[0], source),
        description: literal(args[1], source),
        default: args[2] ? literal(args[2], source) : undefined,
      });
    }
  }

  return path;
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

function hasFlag(node: ts.Expression | undefined, source: ts.SourceFile, field: string): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;

  return node.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(source) === field &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );
}

/** A string argument's value, with a template literal joined back together. */
function literal(node: ts.Expression | undefined, source: ts.SourceFile): string {
  if (!node) return "";

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;

  // `"a" + "b"` across a line break, which is how the longer descriptions
  // in the entry point are written.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return literal(node.left, source) + literal(node.right, source);
  }

  return node.getText(source).replace(/^["'`]|["'`]$/g, "");
}
