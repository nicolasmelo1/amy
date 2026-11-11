import ts from "typescript";
import type { CliCommand, CliOption } from "../docs/lib/facts.js";

/**
 * The commands the repository's operations bring, read out of their sources.
 *
 * A plugin's command is registered at run time from what a machine mounted
 * (`packages/cli/src/operations/commands.ts`), so none of it is in the static
 * chain `cliFactsOf` reads and a plan naming `amy prove show` was refused as
 * naming an unknown command. A plan is judged against the code it was groomed
 * at, so the operations are read out of the sources at the change's base —
 * not out of a build, and not out of any machine's config — every operation
 * in the repository that spells a command, mounted or not. See
 * plans/a-plugin-command-is-a-command-too.md.
 */

/** What a file holding a command-spelled operation is found by, with one git grep. */
export const COMMAND_SPELLING = "cli: {";

/**
 * Where an operation that spells a command can live: the sources of the
 * workspace's plugins, examples and packages — not their tests, whose
 * operations exist to be exercised rather than named in a plan.
 */
export const COMMAND_SOURCES = [
  ":(glob)plugins/*/src/**/*.ts",
  ":(glob)examples/*/src/**/*.ts",
  ":(glob)packages/*/src/**/*.ts",
] as const;

/** One input field, as the command line spells it. */
interface ContributedField {
  readonly name: string;
  /** What its schema takes: how the flag's value is written, and whether it has a `--no-` form. */
  readonly kind: "boolean" | "number" | "string" | "enum" | "array" | "object" | "value";
  /** Whether the schema asks for it, rather than marking it `.optional()`. */
  readonly required: boolean;
  /** Whether the schema defaults it to `true`, which leaves only its `--no-` form. */
  readonly defaultedTrue: boolean;
}

/** One operation the repository spells as a command. */
export interface ContributedOperation {
  readonly file: string;
  /** The words that name the command, `["prove", "show"]`. */
  readonly words: readonly string[];
  /** The fields its command takes by position, by name, in order. */
  readonly positional: readonly string[];
  /** Run when its group is named alone, `worktrees list` under `worktrees`. */
  readonly isDefault: boolean;
  /**
   * Each input field, in the order its `z.object` declares them, or undefined
   * when the input is not an inline `z.object` of named fields: then the
   * command and its positionals still count, and the plan's word for its
   * options is taken rather than judged.
   */
  readonly fields: readonly ContributedField[] | undefined;
}

/** Every operation that spells a command, in the files it was found in. */
export function operationsOf(files: readonly string[], read: (file: string) => string | undefined): ContributedOperation[] {
  return files.flatMap((file) => {
    const text = read(file);
    return text === undefined ? [] : operationsIn(file, text);
  });
}

/** Every object literal with a `cli` that spells words, in one source file. */
function operationsIn(file: string, text: string): ContributedOperation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const operations: ContributedOperation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const operation = operationAt(node, file);
      if (operation) operations.push(operation);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return operations;
}

/** The operation an object literal spells, when its `cli` names a command. */
function operationAt(literal: ts.ObjectLiteralExpression, file: string): ContributedOperation | undefined {
  const cli = propertyOf(literal, "cli");
  if (!cli || !ts.isObjectLiteralExpression(cli)) return undefined;
  const words = stringsOf(propertyOf(cli, "words"));
  if (words.length === 0) return undefined;
  return {
    file,
    words,
    positional: stringsOf(propertyOf(cli, "positional")),
    isDefault: propertyOf(cli, "default")?.kind === ts.SyntaxKind.TrueKeyword,
    fields: fieldsOf(propertyOf(literal, "input")),
  };
}

/**
 * The input's fields, when the command line can spell them: an inline
 * `z.object` whose every member is a named field. Anything else — a named
 * schema, a spread, a composition — is not read, so the operation counts its
 * command and its positionals and the plan's word for its options is taken.
 */
function fieldsOf(input: ts.Expression | undefined): ContributedField[] | undefined {
  if (!input || !ts.isCallExpression(input) || !zodCall(input.expression, "object")) return undefined;
  const body = input.arguments[0];
  if (!body || !ts.isObjectLiteralExpression(body)) return undefined;
  const fields: ContributedField[] = [];
  for (const member of body.properties) {
    if (!ts.isPropertyAssignment(member) || !ts.isIdentifier(member.name)) return undefined;
    if (!ts.isCallExpression(member.initializer)) return undefined;
    fields.push({
      name: member.name.text,
      kind: kindOf(member.initializer),
      required: !calls(member.initializer, "optional"),
      defaultedTrue: defaultedTrue(member.initializer),
    });
  }
  return fields;
}

/** Whether a call is `<zod>.<name>(...)`, the root of a chain the fields are read from. */
function zodCall(expression: ts.Expression, name: string): boolean {
  return ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && ts.isIdentifier(expression.name) && expression.name.text === name;
}

/** What a field's schema takes, read from the root of its zod chain. */
function kindOf(chain: ts.CallExpression): ContributedField["kind"] {
  // `z.number().int().min(0)` is a method on the result of `z.number()`:
  // the kind is the name of the innermost call, the one on the zod root —
  // unless the chain makes it a list on the way, `z.boolean().array()`,
  // which the command line takes as a value, never as a `--no-` form.
  let call: ts.CallExpression = chain;
  while (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && ts.isCallExpression(call.expression.expression)) {
    if (ts.isIdentifier(call.expression.name) && call.expression.name.text === "array") return "array";
    call = call.expression.expression;
  }
  const root = ts.isPropertyAccessExpression(call.expression) && ts.isIdentifier(call.expression.name) ? call.expression.name.text : "";
  return (["boolean", "number", "string", "enum", "array", "object"] as const).find((one) => one === root) ?? "value";
}

/** Whether a zod chain spells `.<name>(...)` anywhere along it. */
function calls(chain: ts.CallExpression, name: string): boolean {
  let current: ts.Expression = chain;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    if (ts.isIdentifier(current.expression.name) && current.expression.name.text === name) return true;
    current = current.expression.expression;
  }
  return false;
}

/** Whether a zod chain defaults its field to `true`, which leaves only its `--no-` form. */
function defaultedTrue(chain: ts.CallExpression): boolean {
  let current: ts.Expression = chain;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    if (ts.isIdentifier(current.expression.name) && current.expression.name.text === "default") {
      return current.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword;
    }
    current = current.expression.expression;
  }
  return false;
}

/** The initializer of a literal's property, when it is assigned. */
function propertyOf(literal: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const member = literal.properties.find((one): one is ts.PropertyAssignment => ts.isPropertyAssignment(one) && ts.isIdentifier(one.name) && one.name.text === name);
  return member?.initializer;
}

/** The string literals a property's array spells, and nothing else. */
function stringsOf(value: ts.Expression | undefined): readonly string[] {
  if (!value || !ts.isArrayLiteralExpression(value)) return [];
  const words: string[] = [];
  for (const one of value.elements) {
    if (!ts.isStringLiteral(one)) return [];
    words.push(one.text);
  }
  return words;
}

/**
 * The operations as CLI commands, beside the CLI's own: each field a flag,
 * spelled camelCase kebab the way `flagOf` spells it, a boolean with its
 * `--no-` form, and `--json` on every one, the way the CLI registers them. A
 * group of an operation's words is a command too, named alone when one of
 * its operations runs by default.
 *
 * An operation whose input was not read keeps its command and its
 * positionals, and takes any option the text spells on it: the reader could
 * not read its input, so it does not judge the plan's word for its options.
 */
export function commandsOf(operations: readonly ContributedOperation[], text: string): CliCommand[] {
  const commands: CliCommand[] = [];
  const spelled = [...new Set(text.match(/--[a-zA-Z][\w-]*/g) ?? [])];
  for (const operation of operations) {
    for (let depth = 1; depth < operation.words.length; depth += 1) {
      const path = operation.words.slice(0, depth);
      if (!commands.some((one) => same(one.path, path))) commands.push({ path, description: "", arguments: [], options: [], isDefault: false, hidden: false });
    }
    const command = commandOf(operation, operation.fields === undefined ? spelled : []);
    const at = commands.findIndex((one) => same(one.path, command.path));
    // Two operations that spell the same words count together, each option
    // and argument of either: which one a mount keeps is the mount's call.
    if (at === -1) commands.push(command);
    else commands[at] = merged(commands[at]!, command);
  }
  return commands.sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));
}

/** Two declarations of the same words as one: every option and argument either declares. */
function merged(one: CliCommand, other: CliCommand): CliCommand {
  const options = [...one.options, ...other.options.filter((option) => !one.options.some((kept) => kept.flags === option.flags))];
  const args = [...one.arguments, ...other.arguments.filter((arg) => !one.arguments.some((kept) => kept.name === arg.name))];
  return { ...one, options, arguments: args, isDefault: one.isDefault || other.isDefault };
}

/** One operation as the CLI declares it: its positionals the arguments, its fields the flags. */
function commandOf(operation: ContributedOperation, unchecked: readonly string[]): CliCommand {
  const byName = new Map((operation.fields ?? []).map((field) => [field.name, field] as const));
  // The flags the command line keeps for itself on every operation's command.
  const options: CliOption[] = [{ flags: "--json", description: "", default: undefined }];
  for (const flag of unchecked) options.push({ flags: flag, description: "", default: undefined });
  for (const field of operation.fields ?? []) {
    if (operation.positional.includes(field.name)) continue;
    const flag = flagOf(field.name);
    if (field.kind === "boolean") {
      // A bare flag says true and its `--no-` form says false, unless the
      // schema already defaults the field to true.
      if (field.defaultedTrue) {
        options.push({ flags: `--no-${flag.slice(2)}`, description: "", default: undefined });
        continue;
      }
      options.push({ flags: flag, description: "", default: undefined }, { flags: `--no-${flag.slice(2)}`, description: "", default: undefined });
      continue;
    }
    options.push({ flags: `${flag} ${placeholderOf(field.kind)}`, description: "", default: undefined });
  }
  return {
    path: [...operation.words],
    description: "",
    arguments: operation.positional.map((name) => ({ name: `<${name}>`, required: byName.get(name)?.required ?? true, description: "" })),
    options,
    isDefault: operation.isDefault,
    hidden: false,
  };
}

/** `staleAfter` as a flag: `--stale-after`, spelled as `flagOf` spells it. */
function flagOf(field: string): string {
  return `--${field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase()}`;
}

/** The placeholder a flag's value is written as, as `declareInput` writes it. */
function placeholderOf(kind: ContributedField["kind"]): string {
  switch (kind) {
    case "number":
      return "<number>";
    case "object":
      return "<json>";
    default:
      return "<value>";
  }
}

function same(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((word, at) => word === other[at]);
}
