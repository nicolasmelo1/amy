import { banner, literal, table } from "../lib/markdown.js";
import { isMounted } from "../lib/facts.js";
import type { Facts, GeneratedFile, MountedFact, WorkflowShape } from "../lib/facts.js";

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
 * that makes somebody try this at all.
 */
export function readmesFrom(facts: Facts): GeneratedFile[] {
  return facts.packages
    .filter(isMounted)
    .map((entry) => ({
      file: `${entry.directory}/README.md`,
      text: readmeFor(entry),
    }));
}

function readmeFor(entry: MountedFact): string {
  const parts = [
    banner("the package itself"),
    "",
    `# ${entry.name}`,
    "",
    entry.description,
    "",
    entry.kind === "workflow" ? workflowIntro() : pluginIntro(entry),
    "",
    ...(entry.workflow?.called ? calling(entry) : installing(entry)),
  ];

  if (entry.kind === "workflow" && entry.workflow) {
    parts.push("", "## The lifecycle", "", states(entry.workflow), "", uses(entry.workflow));
  }

  parts.push("", "## Configuration", "", configuration(entry));

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
    "",
  );

  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n")}`;
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
  return `It emits ${sentence(machine.usesActions.map((a) => `\`${a}\``))}.`;
}

function configuration(entry: MountedFact): string {
  if (entry.settings.length === 0) {
    return [
      "This package declares no settings. A config that gives it some is refused at boot,",
      "because a setting nobody reads is one somebody believes is working.",
    ].join("\n");
  }

  const value = (setting: MountedFact["settings"][number]): string =>
    setting.default !== undefined ? JSON.stringify(setting.default) : `<${setting.type}>`;
  // A called workflow is configured where it is called, so its settings are
  // shown as the binding's `config`, never as a slice of `config.yaml`.
  const example = entry.workflow?.called
    ? ["```ts", `call(${camel(entry.workflow.name)}, { config: { ${entry.settings.map((setting) => `${setting.name}: ${value(setting)}`).join(", ")} } })`, "```"]
    : ["```yaml", "plugins:", `  "${entry.name}":`, ...entry.settings.map((setting) => `    ${setting.name}: ${value(setting)}`), "```"];

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

function sentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
