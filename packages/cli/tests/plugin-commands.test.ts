import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import type { Check, ConfigSchema, Plugin } from "@amykit/core";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { LoadResult } from "../src/loader.js";
import { BUILT_IN_COMMANDS, checks, gather, register, writeFiles } from "../src/plugin-commands.js";
import type { Profile } from "../src/profiles.js";

/**
 * A plugin this repository has never heard of, with a command, a check and a
 * file: the shape the host has to carry without knowing what any of them mean.
 */
const DEMO_SCHEMA = {
  greeting: { type: "string", description: "what the command says", default: "hello" },
} satisfies ConfigSchema;

function demo(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: "@acme/plugin-demo",
    configSchema: DEMO_SCHEMA,
    register() {},
    commands: [
      {
        name: "demo",
        description: "Say what this plugin was configured to say",
        args: [{ name: "who", description: "who to greet", optional: true }],
        run({ settings, args, out }) {
          out.line(`${String(settings.greeting)} ${args[0] ?? "nobody"}`);
        },
      },
    ],
    checks: [
      {
        name: "demo check",
        run(): Check {
          return { label: "demo check", ok: false, detail: "everything is on fire" };
        },
      },
    ],
    files: [{ path: "demo.txt", content: () => "written once\n" }],
    ...overrides,
  };
}

const WORK: Profile = {
  name: "work",
  workflow: "@acme/workflow-unheard-of",
  plugins: ["@acme/plugin-demo"],
  takesNotes: false,
  takesTasks: false,
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  workflows: { work: { workflow: WORK.workflow, plugins: ["@acme/plugin-demo"] } },
  plugins: { "@acme/plugin-demo": { greeting: "hello" } },
};

/** What the loader would answer for a world where these modules import. */
function loading(...plugins: readonly Plugin[]) {
  return async (specs: readonly string[]): Promise<LoadResult> => {
    const bySpec = new Map<string, Plugin>();
    for (const spec of specs) {
      const found = plugins.find((plugin) => plugin.name === spec);
      if (found) bySpec.set(spec, found);
    }
    return { plugins: [...bySpec.values()], problems: [], bySpec };
  };
}

/** A program whose output is captured rather than printed. */
function capturing(): { program: Command; said: string[] } {
  const said: string[] = [];
  const program = new Command().name("amy").exitOverride();
  program.configureOutput({
    writeOut: (text) => said.push(text),
    writeErr: (text) => said.push(text),
  });
  return { program, said };
}

function environment(out: { line(text?: string): void; error(text: string): void }, mounted = true) {
  return {
    home: "/amy",
    config: CONFIG,
    profileFor: () => ({ ok: true as const, profile: WORK }),
    mount: async () => mounted
      ? { ok: true as const, ports: new Map() }
      : { ok: false as const, problems: ["@amykit/plugin-serial-engine: could not be imported"] },
    out,
  };
}

function spoken(): { said: string[]; out: { line(text?: string): void; error(text: string): void } } {
  const said: string[] = [];
  return {
    said,
    out: { line: (text = "") => said.push(text), error: (text: string) => said.push(`error: ${text}`) },
  };
}

describe("a plugin's commands, check and file", () => {
  it("appears in --help marked with its package, runs, and is gone when the plugin is", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    expect(gathered.problems).toEqual([]);

    const { program, said } = capturing();
    const { out } = spoken();
    register(program, gathered.contributions, environment(out));
    program.outputHelp();

    // Help wraps a long description, so the marking is compared as words.
    const help = said.join("").replace(/\s+/g, " ");
    expect(help).toContain("demo [who]");
    expect(help).toContain("(from @acme/plugin-demo)");

    const ran = spoken();
    const withCommand = new Command().name("amy").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    register(withCommand, gathered.contributions, environment(ran.out));
    await withCommand.parseAsync(["node", "amy", "demo", "world"]);
    expect(ran.said).toEqual(["hello world"]);

    // The same command line with the plugin gone is the command line a
    // machine that never mounted it has.
    const without = new Command().name("amy").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    register(without, [], environment(ran.out));
    await expect(without.parseAsync(["node", "amy", "demo", "world"])).rejects.toThrow();
  });

  it("runs while the machine will not mount, and refuses a mount: true command with the reason", async () => {
    const plain = spoken();
    const withoutMachine = await gather(CONFIG, [WORK], loading(demo()));
    const program = new Command().name("amy").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    register(program, withoutMachine.contributions, environment(plain.out, false));
    await program.parseAsync(["node", "amy", "demo", "world"]);
    expect(plain.said).toEqual(["hello world"]);

    const needsMachine = demo({
      commands: [{
        name: "needs-machine",
        description: "Needs the mounted ports",
        mount: true,
        subcommands: [{ name: "list", description: "The same need, one word further in", run: () => {} }],
      }],
    });
    const gathered = await gather(CONFIG, [WORK], loading(needsMachine));
    const refused = spoken();
    const refusedProgram = new Command().name("amy").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    register(refusedProgram, gathered.contributions, environment(refused.out, false));
    // A subcommand runs its own action, so it inherits the parent's need: a
    // command in two words is still one command.
    await refusedProgram.parseAsync(["node", "amy", "needs-machine", "list"]);

    expect(refused.said.join("\n")).toContain("could not be imported");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("refuses a name the host owns, and a name another package already declared", async () => {
    const taken = await gather(CONFIG, [WORK], loading(
      demo({ commands: [{ name: "doctor", description: "Replaces the host's doctor", run: () => {} }] }),
    ));
    expect(taken.problems.join("\n")).toContain("cannot replace a built-in");

    const other = demo({
      name: "@acme/plugin-other",
      commands: [{ name: "demo", description: "Same name, another package", run: () => {} }],
    });
    const both: Profile = { ...WORK, plugins: ["@acme/plugin-demo", "@acme/plugin-other"] };
    const clash = await gather(CONFIG, [both], loading(demo(), other));
    expect(clash.problems.join("\n")).toContain("declared by both @acme/plugin-demo and @acme/plugin-other");
  });

  it("puts the plugin's check in the doctor under its own name, red like any other", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const answered = await checks("/amy", CONFIG, WORK, gathered.contributions, spoken().out);

    expect(answered).toHaveLength(1);
    expect(answered[0]?.label).toBe("@acme/plugin-demo: demo check");
    expect(answered[0]?.ok).toBe(false);
  });

  it("writes the plugin's file once, into the profile's state, and never over an edit", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-files-"));
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const { out, said } = spoken();

    const first = writeFiles(home, CONFIG, WORK, gathered.contributions, out);
    expect(first).toEqual([path.join(home, "work", "demo.txt")]);
    expect(fs.readFileSync(first[0]!, "utf-8")).toBe("written once\n");

    fs.writeFileSync(first[0]!, "edited by hand\n", "utf-8");
    writeFiles(home, CONFIG, WORK, gathered.contributions, out);
    expect(fs.readFileSync(first[0]!, "utf-8")).toBe("edited by hand\n");
    expect(said.filter((line) => line.startsWith("wrote")).length).toBe(1);

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("leaves the host's commands to the host", () => {
    expect(BUILT_IN_COMMANDS).toContain("doctor");
    expect(BUILT_IN_COMMANDS).not.toContain("roster");
    expect(BUILT_IN_COMMANDS).not.toContain("btw");
  });
});

describe("the host carries the command line, not the commands", () => {
  it("imports none of the plugins whose commands moved out", () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, "../src/index.ts"), "utf-8");
    for (const plugin of ["plugin-file-notes", "plugin-file-tasks", "plugin-file-worktree"]) {
      expect(source).not.toContain(`from "@amykit/${plugin}"`);
    }
  });

  it("gets btw, note, worktrees and models from the packages that own them", async () => {
    const { plugin: errand } = await import("@amykit/workflow-errand");
    const { plugin: plans } = await import("@amykit/workflow-note-to-plan");
    const { plugin: worktrees } = await import("@amykit/plugin-file-worktree");
    const { plugin: relay } = await import("@amykit/plugin-agent-relay");

    expect(errand.commands?.map((command) => command.name)).toContain("btw");
    expect(plans.commands?.map((command) => command.name)).toContain("note");
    expect(worktrees.commands?.map((command) => command.name)).toContain("worktrees");
    expect(relay.commands?.map((command) => command.name)).toContain("models");
  });
});
