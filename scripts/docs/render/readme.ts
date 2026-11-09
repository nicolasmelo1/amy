import { banner, literal, table } from "../lib/markdown.js";
import { isMounted } from "../lib/facts.js";
import { readIfPresent } from "../lib/repo.js";
import type { Brought, Facts, GeneratedFile, MountedFact, WorkflowShape } from "../lib/facts.js";

const DOCS = "https://github.com/nicolasmelo1/amy/tree/main/docs";

/**
 * One README per package, written from what the package is.
 *
 * Twenty hand-written READMEs is twenty things that quietly stop being true.
 * What a package mounts, what it contributes and what it can be told are all
 * facts the package already states in code, so the README states them from
 * there and says nothing it cannot derive. The prose that is worth writing
 * lives in `docs/`, and each README links to the page that holds it.
 *
 * The root README is not here on purpose: it is the front door, it is argued
 * rather than listed, and generating it would cost the one piece of writing
 * that makes somebody try this at all. An example under `examples/` is the
 * same kind of door, so its introduction is prose too, and only the reference
 * below it is generated.
 */
export function readmesFrom(facts: Facts): GeneratedFile[] {
  return facts.packages
    .filter(isMounted)
    .map((entry) => {
      const file = `${entry.directory}/README.md`;
      return { file, text: entry.group === "examples" ? exampleReadme(file, entry) : readmeFor(entry) };
    });
}

const REFERENCE_OPEN = "<!-- amy:generated reference -->";
const REFERENCE_CLOSE = "<!-- amy:end reference -->";

/**
 * An example's README: the prose somebody wrote, then the reference.
 *
 * Everything above the `reference` block belongs to whoever wrote it and is
 * kept as it is; the block is rewritten from the package, so a setting the
 * workflow gains still reaches its README. One with no block, or with a block
 * that never closes, is refused rather than written over, because overwriting
 * it would throw the prose away.
 */
function exampleReadme(file: string, entry: MountedFact): string {
  return spliceReference(readIfPresent(file) ?? "", file, reference(entry));
}

/** Puts `generated` between an example README's reference markers, keeping everything outside them. */
export function spliceReference(before: string, file: string, generated: string): string {
  const start = before.indexOf(REFERENCE_OPEN);
  if (start === -1) {
    throw new Error(
      `${file} is an example's README, so it opens with prose and places \`${REFERENCE_OPEN}\` where the generated reference goes`,
    );
  }

  const end = before.indexOf(REFERENCE_CLOSE, start);
  if (end === -1) {
    throw new Error(
      `${file} opens \`${REFERENCE_OPEN}\` and never closes it with \`${REFERENCE_CLOSE}\`, so writing it would lose everything after the marker`,
    );
  }

  return `${before.slice(0, start)}${REFERENCE_OPEN}\n\n${generated}\n\n${REFERENCE_CLOSE}${before.slice(end + REFERENCE_CLOSE.length)}`;
}

function readmeFor(entry: MountedFact): string {
  return `${[
    banner("the package itself"),
    "",
    `# ${entry.name}`,
    "",
    entry.description,
    "",
    entry.kind === "workflow" ? workflowIntro() : pluginIntro(entry),
    "",
    reference(entry),
    "",
  ].join("\n")}`.replace(/\n{3,}/g, "\n\n");
}

/** What the package states in code: how it is mounted, its states, its settings and what it brings. */
function reference(entry: MountedFact): string {
  const parts = [...(entry.workflow?.called ? calling(entry) : installing(entry))];

  if (entry.kind === "workflow" && entry.workflow) {
    parts.push("", "## The lifecycle", "", states(entry.workflow), "", uses(entry.workflow));
  }

  parts.push("", "## Configuration", "", configuration(entry));

  if (entry.brings) parts.push("", "## What it brings", "", bringsOf(entry.brings));

  if (entry.environment.length > 0) {
    parts.push(
      "",
      "## Environment",
      "",
      "This package reads the following, which `amy doctor` checks for you:",
      "",
      table(["Variable", ""], entry.environment.map((name) => [`\`${name}\``, "required at mount"])),
    );
  }

  parts.push(
    "",
    "## Where the reasoning is",
    "",
    docLinks(entry),
    "",
    "## Licence",
    "",
    "MIT",
  );

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}

function pluginIntro(entry: MountedFact): string {
  const gives = [
    ...entry.mounts.map((kind) => `the \`${kind}\` port`),
    ...(entry.mountsEngine ? ["the engine"] : []),
    ...entry.contributes.map((c) => `\`${c.name}\` in the \`${c.collection}\` collection`),
  ];

  return gives.length === 0
    ? "A plugin for [amy](https://github.com/nicolasmelo1/amy)."
    : `A plugin for [amy](https://github.com/nicolasmelo1/amy). It provides ${sentence(gives)}.`;
}

function workflowIntro(): string {
  return [
    "A workflow for [amy](https://github.com/nicolasmelo1/amy): a pure `plan()` that says what",
    "happens next, and a runtime that says how each step is done. The engine drives it without",
    "knowing what any of its states mean.",
  ].join("\n");
}

function installing(entry: MountedFact): string[] {
  return [
    "## Install",
    "",
    "```sh",
    `# Add ${entry.name} to amy.yaml, then install configured plugins:`,
    "amy init --install",
    "```",
    "",
    mountLine(entry),
  ];
}

/** A workflow that takes an input is called from a state of another, never mounted on its own. */
function calling(entry: MountedFact): string[] {
  const ends = entry.workflow?.terminalStates ?? [];
  return [
    "## Calling it",
    "",
    "It takes an input, so it is called from a state of another workflow rather than mounted",
    "as a profile. Depend on it from the package that calls it, mark the state `call` in that",
    `workflow's diagram, draw an edge out of it named for each end (${ends.map((end) => `\`${end}\``).join(", ")}), and bind it:`,
    "",
    "```ts",
    `import { plugin as ${camel(entry.workflow?.name ?? "callee")} } from "${entry.name}";`,
    "",
    `calls: { STATE: call(${camel(entry.workflow?.name ?? "callee")}, { input: (work) => ({ /* … */ }) }) },`,
    "```",
    "",
    "Its settings below are set per call site, with `config` on the binding.",
  ];
}

function camel(name: string): string {
  return name.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());
}

function mountLine(entry: MountedFact): string {
  return [
    "Then name it in `~/.amy/config.yaml`:",
    "",
    "```yaml",
    entry.kind === "workflow"
      ? ["workflows:", `  ${entry.workflow?.name ?? "your-profile"}:`, `    workflow: "${entry.name}"`].join(
          "\n",
        )
      : ["workflows:", "  your-profile:", "    plugins:", `      - "${entry.name}"`].join("\n"),
    "```",
  ].join("\n");
}

function states(machine: WorkflowShape): string {
  return table(
    ["State", "Kind"],
    machine.states.map((state) => [
      `\`${state}\``,
      [
        state === machine.initialState ? "initial" : "",
        machine.waitingStates.includes(state) ? "waiting" : "",
        machine.terminalStates.includes(state) ? "terminal" : "",
      ]
        .filter(Boolean)
        .join(", ") || "working",
    ]),
  );
}

function uses(machine: WorkflowShape): string {
  if (machine.usesActions.length === 0) return "";
  return `It emits ${sentence(machine.usesActions.map((a) => `\`${a}\``))}.`;
}

function configuration(entry: MountedFact): string {
  if (entry.settings.length === 0) {
    return [
      "This package declares no settings. A config that gives it some is refused at boot,",
      "because a setting nobody reads is one somebody believes is working.",
    ].join("\n");
  }

  // A called workflow is configured where it is called, so its settings are
  // shown as the binding's `config`, never as a slice of `config.yaml`. A
  // dotted setting name is the schema's spelling of one nested group; the
  // example the operator copies is the shape the validator accepts, so the
  // dots are opened out into that nesting in either spelling.
  const example = entry.workflow?.called
    ? ["```ts", `call(${camel(entry.workflow.name)}, { config: ${inline(nested(entry.settings))} })`, "```"]
    : ["```yaml", "plugins:", `  "${entry.name}":`, ...block(nested(entry.settings)), "```"];

  return [
    ...example,
    "",
    table(
      ["Setting", "Type", "Required", "Default", "What it is"],
      entry.settings.map((setting) => [
        `\`${setting.name}\``,
        `\`${setting.type}\``,
        setting.required ? "**yes**" : "no",
        literal(setting.default),
        setting.description,
      ]),
    ),
    "",
    "Every field is checked at boot against the schema this package declares. A key that is",
    "not one of the above is a refusal naming the plugin and the key, not a setting that",
    "silently never applied.",
  ].join("\n");
}

function docLinks(entry: MountedFact): string {
  const links = [
    `- [${entry.kind === "workflow" ? "Writing a workflow" : "Writing a plugin"}](${DOCS}/build/${entry.kind === "workflow" ? "write-a-workflow" : "write-a-plugin"}.md)`,
    `- [Reference: ${entry.kind === "workflow" ? "workflows" : "plugins"}](${DOCS}/reference/${entry.kind === "workflow" ? "workflows" : "plugins"}.md)`,
    `- [Ports and the registry](${DOCS}/concepts/ports.md)`,
  ];

  return links.join("\n");
}

/**
 * What the package itself declares: the command line gains the command on the
 * machine that mounts it, `amy doctor` runs its check, and `init` and `add`
 * write its file. Rendered from the declarations, so a changed one is a docs
 * check that fails rather than a README that quietly lies.
 */
function bringsOf(brings: Brought): string {
  const brought: string[] = [];

  if (brings.commands.length > 0) {
    const rows = brings.commands.map((command) => [`\`amy ${command.name}\``, command.description]);
    brought.push(
      table(["Command", "What it does"], rows),
      "",
      "Typed on a machine that mounted this package, and unknown on one that did not.",
    );
  }

  if (brings.checks.length > 0) {
    brought.push(
      "",
      "`amy doctor` runs, after its own checks, every check this package names:",
      "",
      brings.checks.map((name) => `- \`${name}\``).join("\n"),
    );
  }

  if (brings.files.length > 0) {
    brought.push(
      "",
      "`amy init` and `amy add` write, once, into the profile's own directory:",
      "",
      brings.files.map((file) => `- \`${file}\``).join("\n"),
    );
  }

  return brought.join("\n\n");
}

function sentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** One settings slice, as the schema's dotted paths read when given in full. */
function nested(settings: MountedFact["settings"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const setting of settings) {
    const value = setting.default !== undefined ? JSON.stringify(setting.default) : `<${setting.type}>`;
    const path = setting.name.split(".");
    const leaf = path.pop()!;
    let node = out;
    for (const segment of path) {
      const existing = node[segment];
      if (typeof existing !== "object" || existing === null) node[segment] = plain();
      node = node[segment] as Record<string, unknown>;
    }
    node[leaf] = value;
  }
  return out;
}

/** A mapping a dotted path opens out into, before any of it is filled. */
function plain(): Record<string, unknown> {
  return {} as Record<string, unknown>;
}

/** The YAML the config accepts, nested where the schema said a group, indented where the config reads it. */
function block(nested: Record<string, unknown>, depth = 2): string[] {
  const pad = "  ".repeat(depth);
  return Object.entries(nested).flatMap(([key, value]) =>
    isMapping(value) && Object.keys(value).length > 0
      ? [`${pad}${key}:`, ...block(value as Record<string, unknown>, depth + 1)]
      : [`${pad}${key}: ${isMapping(value) ? "{}" : String(value)}`],
  );
}

/** The same slice, spelled for `call()`'s `config`, one line, groups nested. */
function inline(nested: Record<string, unknown>): string {
  const parts = Object.entries(nested).map(([key, value]) =>
    isMapping(value) ? `${key}: { ${joined(value as Record<string, unknown>)} }` : `${key}: ${String(value)}`,
  );
  return parts.length > 0 ? `{ ${parts.join(", ")} }` : "{}";
}

/** The keys of one mapping, joined without the braces around them. */
function joined(nested: Record<string, unknown>): string {
  return Object.entries(nested)
    .map(([key, value]) => (isMapping(value) ? `${key}: { ${joined(value as Record<string, unknown>)} }` : `${key}: ${String(value)}`))
    .join(", ");
}

/** Whether a dotted example value opened into a mapping. */
function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
