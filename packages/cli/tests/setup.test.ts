import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { labelOf } from "@amykit/workflow-setup";
import { runSetupWalk, parseSetupFlags, resolveSetupPlugin, CHANNEL_CATALOG } from "../src/setup.js";
import { loadConfig } from "../src/config.js";
import { CommandRunner } from "@amykit/core";

/** The core a package on disk imports, by file: a temporary root has no workspace to resolve it from. */
const CORE = new URL("../../core/dist/index.js", import.meta.url).href;

/**
 * A scripted stand-in for the terminal conversation, mounted from the
 * machine's own plugins root so the walk reaches it the way it reaches any
 * channel. The answers arrive one per post, in the order the walk asks;
 * everything it posts is recorded to a file, so a test can read back what
 * the person was told and what the person was offered as a default.
 */
const scriptedConversation = (answers: unknown[], record: string): string => `
import { definePlugin } from ${JSON.stringify(CORE)};
import fs from "node:fs";

const answers = ${JSON.stringify(answers)};
let posts = 0;
let at = 0;

export const plugin = definePlugin({
  name: "@amykit/plugin-terminal-conversation",
  configSchema: {},
  register(registry) {
    registry.port("conversation", {
      asks: true,
      open: async (workId) => ({ id: workId }),
      post: async (thread, message) => {
        posts += 1;
        fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({ text: message.text ?? "", ask: message.ask ?? null }) + "\\n");
        return String(posts);
      },
      replies: async () => {
        if (at >= posts) return [];
        const one = answers[at];
        at += 1;
        if (!one) return [];
        if (one.decision) {
          return [{ at: new Date().toISOString(), author: "test", text: "", files: [], kind: "decision", answer: { ask: one.decision.ask, chosen: one.decision.chosen } }];
        }
        return [{ at: new Date().toISOString(), author: "test", text: one.line ?? "", files: [] }];
      },
    });
  },
});
`;

/**
 * One stand-in package: its entry module, and any file that ships beside it.
 */
interface StandIn {
  readonly index: string;
  readonly beside?: Readonly<Record<string, string>>;
}

/**
 * A stand-in channel or harness package, the way npm would lay one out: a
 * plugin whose schema is what the walk asks, one field at a time. The real
 * npm calls belong to the gate scenario; the unit under test here is the
 * walk's decisions and the config it writes.
 */
const schemaPlugin = (name: string, schema: Record<string, unknown>): StandIn => ({
  index: `
import { definePlugin } from ${JSON.stringify(CORE)};

export const plugin = definePlugin({
  name: ${JSON.stringify(name)},
  configSchema: ${JSON.stringify(schema)},
  register(registry) {},
});
`,
});

/**
 * A stand-in workflow package, declared the way amy mounts one: a
 * `defineWorkflow` plugin with a workflow.mmd beside it, the contract every
 * published workflow ships, so the walk installs it the way it installs the
 * real thing and refuses it for the same reasons.
 */
const workflowPlugin = (spec: string, name: string, files: readonly { path: string; content: string }[] = []): StandIn => ({
  index: `
import { defineWorkflow, settled } from ${JSON.stringify(CORE)};

export const plugin = defineWorkflow({
  name: ${JSON.stringify(name)},
  pluginName: ${JSON.stringify(spec)},
  files: ${JSON.stringify(files)},
  configSchema: {},
  policy: {},
  needs: {},
  decide: { IDLE: () => settled("the stand-in workflow is idle; it drives no machine") },
  record: () => ({}),
  observe: async () => ({}),
  actions: () => ({}),
  remember: (_scope, current) => current,
});
`,
  beside: { "workflow.mmd": ["stateDiagram-v2", "    [*] --> IDLE", "    IDLE --> [*]", ""].join("\n") },
});

/**
 * A runner that answers npm installs by hand, writing the stand-in packages
 * into the plugins root, the files that ship beside their entry included. An
 * install of a spec with no stand-in fails the way npm would, so the walk's
 * refusal paths are exercised for real.
 */
function handInstallingRunner(root: string, sources: ReadonlyMap<string, StandIn>): CommandRunner {
  return {
    run: async (command: string, args: readonly string[]) => {
      if (!/npm$/.test(command) || args[0] !== "install") {
        return { ok: false, exitCode: 127, stdout: "", stderr: `no stand-in for ${command}` };
      }
      const at = args.indexOf("--") + 1;
      const installed: string[] = [];
      for (const spec of args.slice(at)) {
        const standIn = sources.get(spec);
        if (standIn === undefined) {
          return { ok: false, exitCode: 1, stdout: "", stderr: `npm ERR! 404 not found: ${spec}` };
        }
        const directory = path.join(root, "node_modules", ...spec.split("/"));
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ name: spec, type: "module", exports: "./index.js" })}\n`);
        fs.writeFileSync(path.join(directory, "index.js"), standIn.index, "utf-8");
        for (const [file, text] of Object.entries(standIn.beside ?? {})) {
          fs.writeFileSync(path.join(directory, file), text, "utf-8");
        }
        installed.push(spec);
      }
      fs.appendFileSync(path.join(root, "installed.log"), `${installed.join("\n")}\n`);
      return { ok: true, exitCode: 0, stdout: "", stderr: "" };
    },
  } as unknown as CommandRunner;
}

/** The stand-in channels the property and the tests choose from, by short name. */
const CHANNEL_SCHEMAS: Readonly<Record<string, Record<string, unknown>>> = {
  "@amykit/plugin-slack": {
    token: { type: "string", required: true, description: "the workspace token" },
    retries: { type: "number", default: 2, description: "how many times a post may be retried" },
    verbose: { type: "boolean", default: false, description: "say what was sent" },
    rooms: { type: "string[]", default: [], description: "the rooms to watch" },
  },
  "@amykit/plugin-telegram": {
    token: { type: "string", required: true, description: "the bot token" },
    pollMs: { type: "number", default: 1000, description: "how often to poll" },
  },
  "@amykit/plugin-notify-inbox": {
    directory: { type: "string", default: "needs-input", description: "where notifications land" },
  },
};

/** Each channel the tests choose from, by short name, by the package it names. */
const PLUGIN_OF: Readonly<Record<string, string>> = {
  slack: "@amykit/plugin-slack",
  telegram: "@amykit/plugin-telegram",
  "notify-inbox": "@amykit/plugin-notify-inbox",
};

/** Every stand-in package the walk can be led to install, by spec. */
function standIns(): Map<string, StandIn> {
  const sources = new Map<string, StandIn>();
  for (const [spec, schema] of Object.entries(CHANNEL_SCHEMAS)) sources.set(spec, schemaPlugin(spec, schema));
  for (const harness of ["@amykit/plugin-claude", "@amykit/plugin-codex", "@amykit/plugin-hermes-agent"]) {
    sources.set(harness, schemaPlugin(harness, {}));
  }
  for (const [name, spec] of [
    ["errand", "@amykit/workflow-errand"],
    ["note-to-plan", "@amykit/workflow-note-to-plan"],
    ["ticket-to-qa", "@amykit/workflow-ticket-to-qa"],
    ["feature-grooming", "@amykit/workflow-feature-grooming"],
  ] as const) {
    sources.set(spec, workflowPlugin(spec, name));
  }
  return sources;
}

/** One machine to walk: a fresh home, its plugins root, and what it recorded. */
function freshMachine() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-setup-"));
  const pluginsRoot = path.join(home, "plugins");
  fs.mkdirSync(pluginsRoot, { recursive: true });
  return { home, pluginsRoot, record: path.join(home, "conversation.log") };
}

/** Writes the scripted conversation into the machine's own plugins root. */
function mountScriptedConversation(machine: ReturnType<typeof freshMachine>, answers: unknown[]): void {
  const directory = path.join(machine.pluginsRoot, "node_modules", "@amykit", "plugin-terminal-conversation");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ name: "@amykit/plugin-terminal-conversation", type: "module", exports: "./index.js" })}\n`);
  fs.writeFileSync(path.join(directory, "index.js"), scriptedConversation(answers, machine.record), "utf-8");
}

/** What the walk told the person, as the record file carries it. */
function told(machine: ReturnType<typeof freshMachine>): { text: string; ask: unknown }[] {
  if (!fs.existsSync(machine.record)) return [];
  return fs.readFileSync(machine.record, "utf-8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { text: string; ask: unknown });
}

/** A config.yaml the walk can read, with the setup profile tuned to ask quickly. */
function writeFastSetupConfig(home: string): void {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(
    path.join(home, "config.yaml"),
    [
      "workflows:",
      "  setup:",
      "    workflow: \"@amykit/workflow-setup\"",
      "    settings:",
      "      policy:",
      "        askBackoffMs: 1",
      "",
    ].join("\n"),
    "utf-8",
  );
}

describe("parseSetupFlags", () => {
  it("reads the dotted setting flags nobody declared, values as strings", () => {
    const flags = parseSetupFlags(["amy", "setup", "--slack.token", "abc", "--slack.rooms=a,b", "--slack.verbose=true"]);
    expect(flags.settings).toEqual({ slack: { token: "abc", rooms: "a,b", verbose: "true" } });
  });

  it("leaves every declared flag to commander, and takes no value at the end", () => {
    expect(parseSetupFlags(["amy", "setup", "--harness", "codex", "--slack.token"]).settings).toEqual({});
  });
});

describe("resolveSetupPlugin", () => {
  it("resolves the words the asks offered to the packages they name", () => {
    expect(resolveSetupPlugin("slack")).toBe("@amykit/plugin-slack");
    expect(resolveSetupPlugin("codex")).toBe("@amykit/plugin-codex");
    expect(resolveSetupPlugin("errand")).toBe("@amykit/workflow-errand");
    expect(resolveSetupPlugin("@amykit/plugin-linear")).toBe("@amykit/plugin-linear");
  });
});

describe("amy setup", () => {
  it("writes the same config when every answer came as a flag as it does when the person typed them (A6, property)", { timeout: 120_000 }, async () => {
    /**
     * The falsifier this property must reject: a flag that answered nothing,
     * planted only when the rule names it. The honest derivation hands the
     * walk every answer; the planted one drops the first setting flag, the
     * bug shape this property exists to catch.
     */
    const FALSIFIER = "flags_skip_a_question";
    const planted = process.env.SF_FALSIFIER === FALSIFIER;

    const harness = fc.constantFrom("claude", "codex", "hermes");
    const workflow = fc.constantFrom("errand", "note-to-plan", "ticket-to-qa", "none");
    const channels = fc.uniqueArray(fc.constantFrom("slack", "telegram", "notify-inbox"), { maxLength: 2 });

    // One value inside the shared accepted set: the four types a flag or a
    // reply line can carry, nothing else (A13).
    const stringish = fc.stringMatching(/^[a-z][a-z0-9]{3,11}$/) as fc.Arbitrary<unknown>;
    const numberish = fc.integer({ min: 0, max: 99 });
    const booleanish = fc.boolean();
    const arrayish = fc.uniqueArray(fc.stringMatching(/^[a-z]{2,7}$/), { maxLength: 3 });

    // The value a field accepts, drawn from the one type its schema
    // declares: an answer the field refuses is not an answer the walk can
    // write on either side of the property.
    const valueFor = (name: string, field: string): fc.Arbitrary<unknown> => {
      const spec = CHANNEL_SCHEMAS[PLUGIN_OF[name]!] ?? {};
      const type = (spec[field] as { type?: string } | undefined)?.type;
      if (type === "number") return numberish;
      if (type === "boolean") return booleanish;
      if (type === "string[]") return arrayish;
      return stringish;
    };

    // Every field of every chosen channel is answered: the walk asks each
    // one, so a set of answers that completes the walk in the terminal is a
    // set that answers them all — a field left unanswered by flags is a walk
    // that stops asking for it (A7), not one that wrote a config. The
    // settings are drawn from the very channels the decisions chose, so the
    // two can never disagree about what was chosen.
    const answers = fc
      .record({ harness, workflow, channels })
      .chain((decisions) =>
        fc
          .record(
            Object.fromEntries(
              decisions.channels.map((name) => [
                name,
                fc.record(Object.fromEntries(Object.keys(CHANNEL_SCHEMAS[PLUGIN_OF[name]!] ?? {}).map((field) => [field, valueFor(name, field)]))),
              ]),
            ),
          )
          .map((settings) => ({ ...decisions, settings })),
      );

    // How one answer is spelled where a person spells it: the line a flag
    // carries and the line a reply carries, both inside the accepted set.
    const asLine = (answer: unknown): string => (Array.isArray(answer) ? (answer as string[]).join(",") : String(answer));

    const property = fc.asyncProperty(answers, async (given) => {
      const standIn = standIns();

      // The flags side: every answer pre-answered, nothing posted, every
      // setting spelled as the line a flag carries it in.
      const byFlag = freshMachine();
      writeFastSetupConfig(byFlag.home);
      const flaggedSettings: Record<string, Record<string, unknown>> = {};
      for (const [name, values] of Object.entries(given.settings)) {
        flaggedSettings[PLUGIN_OF[name]!] = Object.fromEntries(Object.entries(values).map(([field, answer]) => [field, asLine(answer)]));
      }
      const flagsHanded = planted
        ? (() => {
            const first = Object.keys(flaggedSettings)[0];
            const dropped = { ...flaggedSettings };
            if (first) delete dropped[first];
            return dropped;
          })()
        : flaggedSettings;
      const byFlagSaid: string[] = [];
      const byFlagCode = await runSetupWalk(
        byFlag.home,
        { harness: given.harness, workflow: given.workflow, channels: given.channels, settings: flagsHanded },
        handInstallingRunner(byFlag.pluginsRoot, standIn),
        (line: string) => byFlagSaid.push(line),
        { terminal: false, maxMoves: 400 },
      );
      if (byFlagCode !== 0) console.log("FLAG SIDE SAID on", JSON.stringify(given), ":\n", byFlagSaid.join("\n"));

      // The terminal side: the same answers, typed one ask at a time. The
      // decisions arrive as the asks read them — the channels one by the
      // labels it offered.
      const byTyping = freshMachine();
      writeFastSetupConfig(byTyping.home);
      const script: unknown[] = [
        { decision: { ask: "harness", chosen: [given.harness] } },
        { decision: { ask: "workflow", chosen: [given.workflow] } },
        {
          decision: {
            ask: "channels",
            chosen: given.channels.map((name) => labelOf(CHANNEL_CATALOG.find((channel) => channel.name === name)!)),
          },
        },
      ];
      for (const name of given.channels) {
        for (const answer of Object.values(given.settings[name] ?? {})) {
          script.push({ line: asLine(answer) });
        }
      }
      mountScriptedConversation(byTyping, script);
      const byTypingCode = await runSetupWalk(
        byTyping.home,
        { settings: {} },
        handInstallingRunner(byTyping.pluginsRoot, standIn),
        () => undefined,
        { terminal: true, maxMoves: 400 },
      );

      expect(byFlagCode).toBe(0);
      expect(byTypingCode).toBe(0);

      const shapes = (machine: ReturnType<typeof freshMachine>) => {
        const config = loadConfig(machine.home);
        return {
          ladder: config.agent.ladder,
          defaultWorkflow: config.defaultWorkflow,
          extraPlugins: config.extraPlugins,
          plugins: config.plugins,
          workflows: config.workflows,
        };
      };
      expect(shapes(byFlag)).toEqual(shapes(byTyping));

      fs.rmSync(byFlag.home, { recursive: true, force: true });
      fs.rmSync(byTyping.home, { recursive: true, force: true });
    });

    await fc.assert(property, { numRuns: 40 });
  });

  it("parses every value a flag or a line carried into the shared accepted set (A13)", async () => {
    const { parseSetting } = await import("@amykit/workflow-setup");
    const value = fc.oneof(
      fc.stringMatching(/^[a-z][a-z0-9]{3,11}$/) as fc.Arbitrary<unknown>,
      fc.integer({ min: 0, max: 99 }),
      fc.boolean(),
      fc.uniqueArray(fc.stringMatching(/^[a-z]{2,7}$/), { maxLength: 3 }),
    );
    fc.assert(
      fc.property(value, (raw) => {
        const spec = {
          type: Array.isArray(raw) ? "string[]" : typeof raw === "number" ? "number" : typeof raw === "boolean" ? "boolean" : "string",
        } as Parameters<typeof parseSetting>[0];
        const parsed = parseSetting(spec, Array.isArray(raw) ? raw.join(",") : String(raw), undefined);
        const accepted =
          typeof parsed === "string" ||
          typeof parsed === "number" ||
          typeof parsed === "boolean" ||
          (Array.isArray(parsed) && parsed.every((one) => typeof one === "string"));
        expect(accepted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("stops on an ask no terminal will answer, and says the flag that answers it (A7)", async () => {
    const machine = freshMachine();
    const standIn = standIns();
    const said: string[] = [];
    const code = await runSetupWalk(
      machine.home,
      { settings: {} },
      handInstallingRunner(machine.pluginsRoot, standIn),
      (line: string) => said.push(line),
      { terminal: false, maxMoves: 200 },
    );

    expect(code).toBe(1);
    expect(said.join("\n")).toContain("stopped");
    expect(said.join("\n")).toContain("--harness");
    // Writing nothing more: the machine was never configured by a walk that
    // could not ask its first question.
    expect(fs.existsSync(path.join(machine.home, "config.yaml"))).toBe(false);
    fs.rmSync(machine.home, { recursive: true, force: true });
  });

  it("resumes a configured machine at one plugin, offering what it already holds (A5)", async () => {
    const machine = freshMachine();
    writeFastSetupConfig(machine.home);
    fs.writeFileSync(
      path.join(machine.home, "config.yaml"),
      [
        "workflows:",
        "  setup:",
        "    workflow: \"@amykit/workflow-setup\"",
        "    settings:",
        "      policy:",
        "        askBackoffMs: 1",
        "plugins:",
        "  \"@amykit/plugin-slack\":",
        "    token: saved-token",
        "",
      ].join("\n"),
      "utf-8",
    );
    mountScriptedConversation(machine, [{ line: "new-token" }, { line: "5" }, { line: "true" }, { line: "ops,help" }]);

    const standIn = standIns();
    const code = await runSetupWalk(
      machine.home,
      { plugin: "@amykit/plugin-slack", settings: {} },
      handInstallingRunner(machine.pluginsRoot, standIn),
      () => undefined,
      { terminal: true, maxMoves: 400 },
    );

    expect(code).toBe(0);

    // Installed because it was absent: the runner's log names it.
    const installed = fs.readFileSync(path.join(machine.pluginsRoot, "installed.log"), "utf-8");
    expect(installed).toContain("@amykit/plugin-slack");

    // The saved value was the offered default, and the answer was written.
    const posts = told(machine);
    const tokenAsk = posts.find((post) => post.text.includes("token") && post.text.includes("saved-token"));
    expect(tokenAsk).toBeDefined();
    const config = loadConfig(machine.home);
    expect((config.plugins["@amykit/plugin-slack"] as Record<string, unknown>)?.["token"]).toBe("new-token");
    expect(config.extraPlugins).toContain("@amykit/plugin-slack");
    fs.rmSync(machine.home, { recursive: true, force: true });
  });

  it("writes a workflow's own files into the profile that mounts it, never over an edited one", async () => {
    const machine = freshMachine();
    fs.writeFileSync(
      path.join(machine.home, "config.yaml"),
      [
        "workflows:",
        "  setup:",
        "    workflow: \"@amykit/workflow-setup\"",
        "    settings:",
        "      policy:",
        "        askBackoffMs: 1",
        "  tickets:",
        "    workflow: \"@amykit/workflow-ticket-to-qa\"",
        "  edited:",
        "    workflow: \"@amykit/workflow-ticket-to-qa\"",
        "  errands:",
        "    workflow: \"@amykit/workflow-errand\"",
        "",
      ].join("\n"),
      "utf-8",
    );
    fs.mkdirSync(path.join(machine.home, "edited"), { recursive: true });
    fs.writeFileSync(path.join(machine.home, "edited", "roster.yaml"), "edited by hand\n", "utf-8");

    // Already installed and named by the config, the way an operator who
    // edited the config by hand has it: the walk fetches nothing.
    const standIn = standIns();
    standIn.set("@amykit/workflow-ticket-to-qa", workflowPlugin("@amykit/workflow-ticket-to-qa", "ticket-to-qa", [{ path: "roster.yaml", content: "the template\n" }]));
    const runner = handInstallingRunner(machine.pluginsRoot, standIn);
    await runner.run("npm", ["install", "--", "@amykit/workflow-ticket-to-qa", "@amykit/workflow-errand"]);

    const code = await runSetupWalk(
      machine.home,
      { plugin: "@amykit/workflow-ticket-to-qa", settings: {} },
      runner,
      () => undefined,
      { terminal: false, maxMoves: 200 },
    );

    expect(code).toBe(0);
    expect(fs.readFileSync(path.join(machine.home, "tickets", "roster.yaml"), "utf-8")).toBe("the template\n");
    expect(fs.readFileSync(path.join(machine.home, "edited", "roster.yaml"), "utf-8")).toBe("edited by hand\n");
    // Only the profiles that mount it: the errand's profile gets no roster.
    expect(fs.existsSync(path.join(machine.home, "errands", "roster.yaml"))).toBe(false);
    fs.rmSync(machine.home, { recursive: true, force: true });
  });

  it("writes the same config for the same answers on two machines (A1)", async () => {
    const standIn = standIns();
    const results: Record<string, ReturnType<typeof loadConfig>> = {};
    for (const machine of [freshMachine(), freshMachine()]) {
      writeFastSetupConfig(machine.home);
      const code = await runSetupWalk(
        machine.home,
        { harness: "codex", workflow: "errand", channels: ["slack"], settings: { "@amykit/plugin-slack": { token: "t-1", retries: 2, verbose: false, rooms: [] } } },
        handInstallingRunner(machine.pluginsRoot, standIn),
        () => undefined,
        { terminal: false, maxMoves: 400 },
      );
      expect(code).toBe(0);
      results[machine.home] = loadConfig(machine.home);
      fs.rmSync(machine.home, { recursive: true, force: true });
    }
    const [first, second] = Object.values(results);
    if (!first || !second) throw new Error("both walks should have written a config");
    expect(first).toEqual(second);
    expect(first.agent.ladder).toEqual(["codex"]);
    expect(first.defaultWorkflow).toBe("errand");
  });

  it("stops naming the file a config that does not parse, asking nothing (A12)", async () => {
    const machine = freshMachine();
    fs.writeFileSync(path.join(machine.home, "config.yaml"), "workflows: [{ not: yaml\n  {{{", "utf-8");
    mountScriptedConversation(machine, []);
    const said: string[] = [];
    const code = await runSetupWalk(
      machine.home,
      { settings: {} },
      handInstallingRunner(machine.pluginsRoot, standIns()),
      (line) => said.push(line),
      { terminal: true, maxMoves: 200 },
    );

    expect(code).toBe(1);
    expect(said.join("\n")).toContain("config.yaml");
    expect(told(machine)).toEqual([]);
    fs.rmSync(machine.home, { recursive: true, force: true });
  });

  it("stops naming the file a config it cannot write, as an internal error (A12)", async () => {
    const machine = freshMachine();
    writeFastSetupConfig(machine.home);
    fs.chmodSync(path.join(machine.home, "config.yaml"), 0o444);
    mountScriptedConversation(machine, []);
    const said: string[] = [];
    const code = await runSetupWalk(
      machine.home,
      { harness: "codex", settings: {} },
      handInstallingRunner(machine.pluginsRoot, standIns()),
      (line) => said.push(line),
      { terminal: true, maxMoves: 200 },
    );

    expect(code).toBe(1);
    expect(said.join("\n")).toContain("config.yaml");
    fs.chmodSync(path.join(machine.home, "config.yaml"), 0o644);
    fs.rmSync(machine.home, { recursive: true, force: true });
  });
});
