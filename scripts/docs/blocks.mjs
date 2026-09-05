import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { ROOT } from "./lib/repo.mjs";
import { literal, table } from "./lib/markdown.mjs";

/**
 * Every generated block, by the name a page names it with.
 *
 * One function, one block, and each one is a pure function of the facts. A
 * page that names a block nothing here produces is an error, and a block
 * nothing places is an error too — a reference table that exists and is
 * linked from nowhere is the same as one that is out of date.
 */
export function blocksFrom(facts) {
  return {
    "cli-global": cliGlobal(facts.cli),
    "cli-commands": cliCommands(facts.cli),
    "cli-index": cliIndex(facts.cli),
    "core-actions": coreActions(facts.core, facts.packages),
    "core-contracts": coreContracts(facts.core),
    "port-kinds": portKinds(facts),
    "plan-kinds": planKinds(facts.core),
    "event-kinds": eventKinds(facts.core),
    "event-detail": eventDetail(facts.core),
    "plugin-index": pluginIndex(facts.packages),
    "plugin-settings": pluginSettings(facts.packages),
    "collections": collections(facts.packages),
    "environment": environment(facts.packages),
    "workflow-index": workflowIndex(facts.packages),
    "workflow-states": workflowStates(facts.packages),
    "workspace-layout": workspaceLayout(facts.packages),
    "workspace-dependencies": workspaceDependencies(facts.packages),
    "skills-index": skillsIndex(facts.skills),
    "factory-gates": factoryGates(facts.factory),
    "factory-rules": factoryRules(facts.factory),
    "factory-disabled": factoryDisabled(facts.factory),
    "catalog-shipped": catalogShipped(facts.packages),
    "changelog-releases": changelogReleases(facts.releases),
    "changelog-unreleased": changelogUnreleased(facts.releases),
    "config-fields": configFields(facts.config),
    "config-profile": configProfile(facts.config),
    "config-example": configExample(facts.config),
    "roster-example": rosterExample(facts.config),
  };
}

function configFields(config) {
  return table(
    ["Key", "Type", "Default", "What it is"],
    config.fields.map((field) => [
      `\`${field.name}\``,
      `\`${field.type}\``,
      config.defaults[field.name] ? `\`${config.defaults[field.name]}\`` : "",
      field.doc,
    ]),
  );
}

function configProfile(config) {
  return table(
    ["Key", "Type", "Required", "What it is"],
    config.profile.map((field) => [
      `\`${field.name}\``,
      `\`${field.type}\``,
      field.optional ? "no" : "**yes**",
      field.doc,
    ]),
  );
}

/** The template `amy init` writes, taken from the constant it writes it from. */
function configExample(config) {
  return ["```yaml", config.example.trimEnd(), "```"].join("\n");
}

function rosterExample(config) {
  return ["```yaml", config.exampleRoster.trimEnd(), "```"].join("\n");
}

function cliGlobal(cli) {
  return table(
    ["Option", "What it does"],
    cli.options.map((option) => [`\`${option.flags}\``, option.description]),
  );
}

function cliIndex(cli) {
  return table(
    ["Command", "What it does"],
    cli.commands.map((command) => [
      `[\`amy ${command.path.join(" ")}\`](#amy-${command.path.join("-")})`,
      command.description,
    ]),
  );
}

/** One section per command, so each one is linkable on its own. */
function cliCommands(cli) {
  return cli.commands
    .map((command) => {
      const name = command.path.join(" ");
      const usage = [
        "amy",
        ...command.path,
        ...(command.options.length > 0 ? ["[options]"] : []),
        ...command.arguments.map((argument) => argument.name),
      ].join(" ");

      const parts = [`### \`amy ${name}\``, "", command.description, "", "```sh", usage, "```"];

      if (command.isDefault) {
        parts.push("", `Runs when \`amy ${command.path.slice(0, -1).join(" ")}\` is given no subcommand.`);
      }

      if (command.arguments.length > 0) {
        parts.push(
          "",
          table(
            ["Argument", "Required", "What it is"],
            command.arguments.map((argument) => [
              `\`${argument.name}\``,
              argument.required ? "yes" : "no",
              argument.description,
            ]),
          ),
        );
      }

      if (command.options.length > 0) {
        parts.push(
          "",
          table(
            ["Option", "Default", "What it does"],
            command.options.map((option) => [
              `\`${option.flags}\``,
              option.default === undefined ? "" : literal(option.default),
              option.description,
            ]),
          ),
        );
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function coreActions(core, packages) {
  const added = packages
    .flatMap((entry) => (entry.addsActions ?? []).map((action) => ({ ...action, by: entry.name })))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = core.actions.map((action) => [
    `\`${action.name}\``,
    `\`${action.port}\``,
    `\`${action.method}()\``,
    "`@amykit/core`",
    action.doc,
  ]);

  const extra = added.map((action) => [
    `\`${action.name}\``,
    `\`${action.port}\``,
    `\`${action.method}()\``,
    `\`${action.by}\``,
    "Registered by the plugin that brings the port behind it.",
  ]);

  return table(["Action", "Port", "Method", "Shipped by", "What it is"], [...rows, ...extra]);
}

function coreContracts(core) {
  return core.ports
    .map((port) => {
      const parts = [`### \`${port.interface}\``, "", port.doc, "", `Declared in \`${port.file}\`.`];

      parts.push(
        "",
        table(
          ["Method", "What it does"],
          port.methods.map((method) => [`\`${method.signature}\``, method.doc]),
        ),
      );

      return parts.join("\n");
    })
    .join("\n\n");
}

/**
 * The port kinds that actually exist, and what fills each one.
 *
 * Derived from two directions at once — what an action dispatches to, and
 * what a shipped plugin mounts — because either alone would leave a hole. An
 * action naming a port nobody mounts is a boot-time refusal, and a port
 * nothing dispatches to is one a workflow reaches directly.
 */
function portKinds(facts) {
  const kinds = new Map();

  const note = (kind) => {
    if (!kinds.has(kind)) kinds.set(kind, { actions: [], mountedBy: [] });
    return kinds.get(kind);
  };

  for (const action of facts.core.actions) note(action.port).actions.push(action.name);

  for (const entry of facts.packages) {
    for (const kind of entry.mounts ?? []) note(kind).mountedBy.push(entry.name);
    for (const action of entry.addsActions ?? []) note(action.port).actions.push(action.name);
  }

  return table(
    ["Port", "Mounted by", "Actions dispatched to it"],
    [...kinds.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, held]) => [
        `\`${kind}\``,
        unique(held.mountedBy).map((name) => `\`${name}\``).join("<br>") || "_nothing shipped_",
        unique(held.actions).map((name) => `\`${name}\``).join(", ") || "_reached directly_",
      ]),
  );
}

function planKinds(core) {
  return table(
    ["Kind", "Fields", "What it means"],
    core.plans.map((plan) => [
      `\`${plan.kind}\``,
      plan.fields.map((field) => `\`${field}\``).join("<br>"),
      plan.doc,
    ]),
  );
}

function eventKinds(core) {
  return table(
    ["Kind", "Written when", "Always carries"],
    core.events.map((event) => [
      `\`${event.kind}\``,
      event.says,
      event.requires.length > 0
        ? event.requires.map((field) => `\`${field}\``).join(", ")
        : "_nothing beyond `at` and `kind`_",
    ]),
  );
}

function eventDetail(core) {
  return core.events
    .filter((event) => event.detail.length > 0)
    .map((event) =>
      [
        `**\`${event.kind}\`**`,
        "",
        table(
          ["Field", "Type"],
          event.detail.map((field) => [`\`${field.field}\``, `\`${field.type}\``]),
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

function pluginIndex(packages) {
  return table(
    ["Plugin", "What it is", "Mounts", "Contributes"],
    plugins(packages).map((entry) => [
      `\`${entry.name}\``,
      entry.description,
      describeMounts(entry),
      entry.contributes.map((c) => `\`${c.collection}:${c.name}\``).join("<br>"),
    ]),
  );
}

/** One section per plugin: what it mounts, and every setting it declares. */
function pluginSettings(packages) {
  return plugins(packages)
    .map((entry) => {
      const parts = [`### \`${entry.name}\``, "", entry.description, ""];

      parts.push(
        table(
          ["", ""],
          [
            ["Source", `\`${entry.directory}\``],
            ["Mounts", describeMounts(entry) || "_nothing_"],
            [
              "Contributes",
              entry.contributes.map((c) => `\`${c.collection}:${c.name}\``).join(", ") || "_nothing_",
            ],
            [
              "Needs in the environment",
              entry.environment.map((name) => `\`${name}\``).join(", ") || "_nothing_",
            ],
            [
              "Depends on",
              entry.amyDependencies.map((name) => `\`${name}\``).join(", ") || "_nothing in this workspace_",
            ],
          ],
        ),
      );

      if (entry.settings.length === 0) {
        parts.push("", "This plugin declares no settings, so the config must not give it any.");
      } else {
        parts.push(
          "",
          "```yaml",
          "plugins:",
          `  "${entry.name}":`,
          ...entry.settings.map((setting) => `    ${setting.name}: ${asYaml(setting)}`),
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
        );
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function collections(packages) {
  const found = new Map();

  for (const entry of packages) {
    for (const contribution of entry.contributes ?? []) {
      const held = found.get(contribution.collection) ?? [];
      held.push({ name: contribution.name, by: entry.name });
      found.set(contribution.collection, held);
    }
  }

  return table(
    ["Collection", "Contributed to by", "Read by"],
    [...found.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collection, held]) => [
        `\`${collection}\``,
        held
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((one) => `\`${one.name}\` — \`${one.by}\``)
          .join("<br>"),
        readerOf(collection, packages),
      ]),
  );
}

/**
 * Which plugin consumes a collection, named where the code names it.
 *
 * A collection has no declared consumer — that is the point of it — so this
 * says what can be said honestly: the package that exports the collection's
 * name is the one that reads it.
 */
function readerOf(collection, packages) {
  const owner = packages.find((entry) =>
    (entry.exports ?? []).some((name) => /_COLLECTION$|^WORKFLOW_RUNTIME$/.test(name)) &&
    exportsCollection(entry, collection),
  );

  return owner ? `\`${owner.name}\`` : "_whichever plugin reads it_";
}

function exportsCollection(entry, collection) {
  const constant = `${collection.replace(/-/g, "_").toUpperCase()}_COLLECTION`;
  return (entry.exports ?? []).includes(constant) || collection === "workflow-runtime";
}

function environment(packages) {
  const rows = packages
    .filter((entry) => (entry.environment ?? []).length > 0)
    .flatMap((entry) => entry.environment.map((name) => [`\`${name}\``, `\`${entry.name}\``]))
    .sort((a, b) => a[0].localeCompare(b[0]));

  return table(["Variable", "Read by"], rows);
}

function workflowIndex(packages) {
  return table(
    ["Workflow", "Profile name", "States", "What it does"],
    workflows(packages).map((entry) => [
      `\`${entry.name}\``,
      `\`${entry.workflow.name}\``,
      String(entry.workflow.states.length),
      entry.description,
    ]),
  );
}

function workflowStates(packages) {
  return workflows(packages)
    .map((entry) => {
      const machine = entry.workflow;

      return [
        `### \`${entry.name}\``,
        "",
        entry.description,
        "",
        table(
          ["", ""],
          [
            ["Profile name", `\`${machine.name}\``],
            ["Source", `\`${entry.directory}\``],
            ["Starts in", `\`${machine.initialState}\``],
            ["Terminal", machine.terminalStates.map((s) => `\`${s}\``).join(", ")],
            [
              "Waits in",
              machine.waitingStates.map((s) => `\`${s}\``).join(", ") || "_nowhere_",
            ],
            ["Actions it emits", machine.usesActions.map((a) => `\`${a}\``).join(", ")],
            [
              "Observations it reads",
              machine.usesObservers.map((o) => `\`${o}\``).join(", ") || "_none_",
            ],
          ],
        ),
        "",
        table(
          ["#", "State", "Kind"],
          machine.states.map((state, index) => [
            String(index + 1),
            `\`${state}\``,
            [
              state === machine.initialState ? "initial" : "",
              machine.waitingStates.includes(state) ? "waiting" : "",
              machine.terminalStates.includes(state) ? "terminal" : "",
            ]
              .filter(Boolean)
              .join(", ") || "working",
          ]),
        ),
      ].join("\n");
    })
    .join("\n\n");
}

function workspaceLayout(packages) {
  const lines = [];

  for (const group of ["packages", "plugins"]) {
    const inGroup = packages.filter((entry) => entry.group === group);
    if (inGroup.length === 0) continue;

    lines.push(`${group}/`);
    for (const [index, entry] of inGroup.entries()) {
      const last = index === inGroup.length - 1;
      const name = entry.directory.split("/")[1];
      lines.push(`${last ? "└──" : "├──"} ${name.padEnd(20)} ${entry.description}`);
    }
    lines.push("");
  }

  return ["```text", ...lines.map((line) => line.trimEnd()), "```"].join("\n").replace(/\n+```$/, "\n```");
}

function workspaceDependencies(packages) {
  return table(
    ["Package", "Kind", "Depends on, in this workspace"],
    packages.map((entry) => [
      `\`${entry.name}\``,
      entry.kind,
      entry.amyDependencies.map((name) => `\`${name}\``).join(", ") || "_nothing_",
    ]),
  );
}

function skillsIndex(skills) {
  return table(
    ["Skill", "When to reach for it"],
    skills.map((skill) => [`\`/${skill.name}\``, skill.description]),
  );
}

function factoryGates(factory) {
  return table(
    ["Gate", "What expires it", "Assertions"],
    factory.gates.map((gate) => [
      `\`${gate.name}\``,
      gate.activation.map((glob) => `\`${glob}\``).join("<br>"),
      String(gate.assertions.length),
    ]),
  );
}

function factoryRules(factory) {
  return table(
    ["Rule", "What it holds"],
    factory.rules.filter((rule) => rule.enabled).map((rule) => [`\`${rule.id}\``, rule.title]),
  );
}

function factoryDisabled(factory) {
  return table(
    ["Rule", "Why it is off"],
    factory.disabled.map((rule) => [`\`${rule.id}\``, rule.reason]),
  );
}

/**
 * The catalogue: what is in the box, ready to be listed beside what is not.
 *
 * Only what this workspace publishes. A plugin somebody else wrote is found
 * by the registry and by a topic on the code host, which is a different
 * source and deliberately not this file's job to invent.
 */
function catalogShipped(packages) {
  const rows = packages
    .filter((entry) => !entry.private && (entry.kind === "plugin" || entry.kind === "workflow"))
    .map((entry) => [
      `\`${entry.name}\``,
      entry.kind,
      entry.description,
      `[npm](https://www.npmjs.com/package/${entry.name})`,
    ]);

  return table(["Package", "Kind", "What it is", ""], rows);
}

function changelogReleases(releases) {
  if (releases.releases.length === 0) {
    return [
      "No release has been cut yet. The release workflow is deliberately dormant until",
      "somebody arms it, so this is the truth rather than a fetch that failed —",
      "see [the release path](../development/releasing.md).",
    ].join("\n");
  }

  return releases.releases
    .map((release) =>
      [
        `## [${release.name}](${release.url})`,
        "",
        `\`${release.tag}\` · ${date(release.publishedAt)}${release.prerelease ? " · pre-release" : ""}`,
        "",
        release.body || "_No notes._",
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function changelogUnreleased(releases) {
  if (releases.unreleased.length === 0) {
    return "Nothing is pending. `.changeset/` is empty, which between releases is not a mistake.";
  }

  return releases.unreleased
    .map((change) =>
      [
        `### ${change.title}`,
        "",
        `\`${change.level}\` · ${change.bumps.map((b) => `\`${b.package}\``).join(", ")}`,
        "",
        change.body,
      ].join("\n"),
    )
    .join("\n\n");
}

function date(iso) {
  return String(iso).slice(0, 10);
}

function plugins(packages) {
  return packages
    .filter((entry) => entry.kind === "plugin")
    .sort((a, b) => a.name.localeCompare(b.name));
}

function workflows(packages) {
  return packages
    .filter((entry) => entry.kind === "workflow" && entry.workflow)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function describeMounts(entry) {
  const parts = (entry.mounts ?? []).map((kind) => `\`${kind}\``);
  if (entry.mountsEngine) parts.push("the engine");
  if (entry.mountsWorkflow) parts.push(`the \`${entry.mountsWorkflow}\` workflow`);
  return parts.join("<br>");
}

function unique(values) {
  return [...new Set(values)].sort();
}

/** A setting written the way it would appear in the config file. */
function asYaml(setting) {
  const value = setting.default !== undefined ? setting.default : placeholder(setting.type);
  const rendered = yaml.stringify(value).trim();
  return rendered.includes("\n") ? `\n${indent(rendered, 6)}` : rendered;
}

function placeholder(type) {
  switch (type) {
    case "string":
      return "…";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string[]":
      return ["…"];
    default:
      return {};
  }
}

function indent(text, spaces) {
  return text
    .split("\n")
    .map((line) => `${" ".repeat(spaces)}${line}`)
    .join("\n");
}

/** The skills shipped inside the CLI, read from the front matter of each. */
export function skillFacts() {
  const directory = path.join(ROOT, "packages/cli/skills");
  if (!fs.existsSync(directory)) return [];

  const found = [];

  for (const entry of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, entry, "SKILL.md");
    if (!fs.existsSync(file)) continue;

    const text = fs.readFileSync(file, "utf8");
    const match = /^---\n([\s\S]*?)\n---/.exec(text);
    const data = match ? (yaml.parse(match[1]) ?? {}) : {};

    found.push({
      name: data.name ?? entry,
      version: data.version ?? "",
      // The first sentence: the rest of a skill description is the trigger
      // list, which a reader of the docs is not the audience for.
      description: firstSentence(data.description ?? ""),
      directory: `packages/cli/skills/${entry}`,
    });
  }

  return found;
}

function firstSentence(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const stop = flat.search(/\.\s/);
  return stop === -1 ? flat : flat.slice(0, stop + 1);
}
