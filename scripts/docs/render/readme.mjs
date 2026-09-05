import { banner, literal, table } from "../lib/markdown.mjs";

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
export function readmesFrom(facts) {
  return facts.packages
    .filter((entry) => entry.kind === "plugin" || entry.kind === "workflow")
    .map((entry) => ({
      file: `${entry.directory}/README.md`,
      text: readmeFor(entry),
    }));
}

function readmeFor(entry) {
  const parts = [
    banner("the package itself"),
    "",
    `# ${entry.name}`,
    "",
    entry.description,
    "",
    entry.kind === "workflow" ? workflowIntro() : pluginIntro(entry),
    "",
    "## Install",
    "",
    "```sh",
    `npm install -g ${entry.name}`,
    "```",
    "",
    mountLine(entry),
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

function pluginIntro(entry) {
  const gives = [
    ...entry.mounts.map((kind) => `the \`${kind}\` port`),
    ...(entry.mountsEngine ? ["the engine"] : []),
    ...entry.contributes.map((c) => `\`${c.name}\` in the \`${c.collection}\` collection`),
  ];

  return gives.length === 0
    ? "A plugin for [amy](https://github.com/nicolasmelo1/amy)."
    : `A plugin for [amy](https://github.com/nicolasmelo1/amy). It provides ${sentence(gives)}.`;
}

function workflowIntro() {
  return [
    "A workflow for [amy](https://github.com/nicolasmelo1/amy): a pure `plan()` that says what",
    "happens next, and a runtime that says how each step is done. The engine drives it without",
    "knowing what any of its states mean.",
  ].join("\n");
}

function mountLine(entry) {
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

function states(machine) {
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

function uses(machine) {
  const observers =
    machine.usesObservers.length > 0
      ? `, and reads the ${sentence(machine.usesObservers.map((o) => `\`${o}\``))} observation`
      : "";

  return `It emits ${sentence(machine.usesActions.map((a) => `\`${a}\``))}${observers}.`;
}

function configuration(entry) {
  if (entry.settings.length === 0) {
    return [
      "This package declares no settings. A config that gives it some is refused at boot,",
      "because a setting nobody reads is one somebody believes is working.",
    ].join("\n");
  }

  return [
    "```yaml",
    "plugins:",
    `  "${entry.name}":`,
    ...entry.settings.map(
      (setting) =>
        `    ${setting.name}: ${setting.default !== undefined ? JSON.stringify(setting.default) : `<${setting.type}>`}`,
    ),
    "```",
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

function docLinks(entry) {
  const links = [
    `- [${entry.kind === "workflow" ? "Writing a workflow" : "Writing a plugin"}](${DOCS}/build/${entry.kind === "workflow" ? "write-a-workflow" : "write-a-plugin"}.md)`,
    `- [Reference: ${entry.kind === "workflow" ? "workflows" : "plugins"}](${DOCS}/reference/${entry.kind === "workflow" ? "workflows" : "plugins"}.md)`,
    `- [Ports and the registry](${DOCS}/concepts/ports.md)`,
  ];

  return links.join("\n");
}

function sentence(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
