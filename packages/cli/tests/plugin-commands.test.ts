import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "@amykit/core";
import type { OperationSchema, Plugin } from "@amykit/core";
import { BUILT_IN_COMMANDS, checks, gather, migrateRootFiles, runSetup, writeFiles } from "../src/plugin-commands.js";
import { register } from "../src/operations/commands.js";
import { installContract } from "../src/operations/contract.js";
import type { Profile } from "../src/profiles.js";
import { CONFIG, WORK, demo, environment, greet, loading, program, spoken } from "./operations/support.js";

/** One operation of another package, spelled however the test needs. */
function otherOperation(id: string, words: readonly string[], extra: { mount?: boolean; localOnly?: boolean } = {}) {
  return defineOperation({
    id,
    domain: id.split(".")[0]!,
    summary: "Another package's operation",
    description: "Answers nothing in particular. Changes nothing.",
    input: z.object({}),
    output: z.object({ ok: z.boolean().describe("ok") }),
    writes: [],
    http: { method: "get", path: `/${id.replace(".", "/")}` },
    cli: { words },
    examples: [{ summary: "always", input: {}, output: { ok: true } }],
    ...extra,
    async handler() {
      return { ok: true };
    },
  });
}

describe("a plugin's operations, check and file", () => {
  it("appears in --help marked with its package and in amy contract, runs, and both are gone when the plugin is", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    expect(gathered.problems).toEqual([]);

    const listed = program();
    register(listed.program, gathered.contributions, environment(spoken().out));
    listed.program.outputHelp();
    // Help wraps a long description, so the marking is compared as words.
    const help = listed.help.join("").replace(/\s+/g, " ");
    expect(help).toContain("demo [options] [who]");
    expect(help).toContain("(from @acme/plugin-demo)");

    const document = installContract(gathered.contributions) as { paths: Record<string, Record<string, { operationId: string }>> };
    expect(document.paths["/demo/greetings"]?.post?.operationId).toBe("demo.greet");

    const ran = spoken();
    const withCommand = program().program;
    register(withCommand, gathered.contributions, environment(ran.out));
    await withCommand.parseAsync(["node", "amy", "demo", "world"]);
    expect(ran.said[0]).toBe("said  hello world");
    expect(process.exitCode).toBe(0);

    // The same command line, and the same contract, with the plugin gone are
    // the ones a machine that never mounted it has.
    const removed = await gather({ ...CONFIG, workflows: { work: { workflow: WORK.workflow, plugins: [] } } }, [{ ...WORK, plugins: [] }], loading(demo()));
    const without = program().program;
    register(without, removed.contributions, environment(ran.out));
    await expect(without.parseAsync(["node", "amy", "demo", "world"])).rejects.toThrow();
    const after = installContract(removed.contributions) as { paths: Record<string, unknown> };
    expect(after.paths["/demo/greetings"]).toBeUndefined();
  });

  it("refuses a plugin that still declares commands, naming the plugin and the member", async () => {
    const legacy = { ...demo(), commands: [{ name: "demo", description: "the old way", run: () => {} }] } as unknown as Plugin;
    const gathered = await gather(CONFIG, [WORK], loading(legacy));
    expect(gathered.problems.join("\n")).toContain("@acme/plugin-demo declares `commands`, which amy no longer reads");
  });

  it("runs an operation without mount while the machine will not mount, and refuses one with mount: true naming why", async () => {
    const plain = spoken();
    const gathered = await gather(CONFIG, [WORK], loading(demo({ operations: [greet, otherOperation("demo.needs-machine", ["needs-machine", "list"], { mount: true })] })));
    const first = program().program;
    register(first, gathered.contributions, environment(plain.out, false));
    await first.parseAsync(["node", "amy", "demo", "world"]);
    expect(plain.said[0]).toBe("said  hello world");
    expect(process.exitCode).toBe(0);

    const refused = spoken();
    const second = program().program;
    register(second, gathered.contributions, environment(refused.out, false));
    await second.parseAsync(["node", "amy", "needs-machine", "list"]);
    expect(refused.errors.join("\n")).toContain("`amy needs-machine list` needs the machine work drives, which did not come up");
    expect(refused.errors.join("\n")).toContain("could not be imported");
    expect(process.exitCode).toBe(70);
    process.exitCode = 0;
  });

  it("refuses a name the host owns, and an id or a word another package already declared, naming both", async () => {
    const taken = await gather(CONFIG, [WORK], loading(demo({ operations: [otherOperation("demo.doctor", ["doctor"])] })));
    expect(taken.problems.join("\n")).toContain("cannot replace a built-in");

    const both: Profile = { ...WORK, plugins: ["@acme/plugin-demo", "@acme/plugin-other"] };
    const sameWord = demo({ name: "@acme/plugin-other", operations: [otherOperation("other.greet", ["demo", "again"])] });
    const wordClash = await gather(CONFIG, [both], loading(demo(), sameWord));
    expect(wordClash.problems.join("\n")).toContain("`amy demo` is declared by both @acme/plugin-demo and @acme/plugin-other");

    const sameId = demo({ name: "@acme/plugin-other", operations: [otherOperation("demo.greet", ["other"])] });
    const idClash = await gather(CONFIG, [both], loading(demo(), sameId));
    expect(idClash.problems.join("\n")).toContain("the operation `demo.greet` is declared by both @acme/plugin-demo and @acme/plugin-other");
  });

  it("brings an operation a profile's fork adds to the command line and the contract, run only where it is mounted", async () => {
    const forked = demo({ operations: [greet, otherOperation("demo.added", ["demo-added"])] });
    const other: Profile = { ...WORK, name: "forked" };
    const config = { ...CONFIG, workflows: { ...CONFIG.workflows, forked: { workflow: WORK.workflow, plugins: ["@acme/plugin-demo"] } } };
    const gathered = await gather(config, [WORK, other], async (specs, profile) => loading(profile === "forked" ? forked : demo())(specs));
    expect(gathered.problems).toEqual([]);

    const contribution = gathered.contributions[0]!;
    expect(contribution.operations.map((operation) => operation.id)).toEqual(["demo.greet", "demo.ticks", "demo.added"]);
    const document = installContract(gathered.contributions) as { paths: Record<string, unknown> };
    expect(document.paths["/demo/added"]).toBeDefined();

    const heard = spoken();
    const made = program().program;
    register(made, gathered.contributions, { ...environment(heard.out), profileFor: () => ({ ok: true as const, profile: WORK }) });
    await made.parseAsync(["node", "amy", "demo-added"]);
    expect(heard.errors.join("\n")).toContain("`demo.added` is not declared by the @acme/plugin-demo that work mounts");
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
  });

  it("refuses a workflow compiled against an older core that still passes commands to defineWorkflow", async () => {
    const { defineWorkflow } = await import("@amykit/core");
    const legacy = defineWorkflow({
      name: "legacy",
      pluginName: "@acme/plugin-demo",
      configSchema: {},
      policy: {},
      needs: {},
      record: () => ({}),
      decide: {},
      observe: async () => ({}),
      actions: {},
      commands: [{ name: "legacy", description: "the old way", run: () => {} }],
    } as never) as Plugin;
    const gathered = await gather(CONFIG, [WORK], loading(legacy));
    expect(gathered.problems.join("\n")).toContain("@acme/plugin-demo declares `commands`, which amy no longer reads");
  });

  it("refuses one package declaring an operation id twice under two spellings", async () => {
    const twice = await gather(CONFIG, [WORK], loading(demo({ operations: [otherOperation("demo.same", ["same-one"]), otherOperation("demo.same", ["same-two"])] })));
    expect(twice.problems.join("\n")).toContain("@acme/plugin-demo declares the operation `demo.same` twice");
  });

  it("refuses a profile's fork declaring an id twice, even when the first profile declares it once", async () => {
    const forked = demo({ operations: [greet, otherOperation("demo.greet", ["demo-again"])] });
    const other: Profile = { ...WORK, name: "forked" };
    const config = { ...CONFIG, workflows: { ...CONFIG.workflows, forked: { workflow: WORK.workflow, plugins: ["@acme/plugin-demo"] } } };
    const gathered = await gather(config, [WORK, other], async (specs, profile) => loading(profile === "forked" ? forked : demo())(specs));
    expect(gathered.problems.join("\n")).toContain("@acme/plugin-demo declares the operation `demo.greet` twice");
  });

  it("refuses at load an input the command line cannot spell: a composed object, two fields one flag, or a field taking --json", async () => {
    const refused = async (input: Record<string, unknown>) =>
      (await gather(CONFIG, [WORK], loading(demo({ operations: [spelledOver(input)] })))).problems.join("\n");

    expect(await refused({ allOf: [{ type: "object", properties: { count: { type: "number" } } }, { type: "object", properties: { verbose: { type: "boolean" } } }] }))
      .toContain("`demo.spelled` takes an input composed with allOf, anyOf or oneOf");
    expect(await refused({ type: "object", properties: { foo_bar: { type: "string" }, fooBar: { type: "string" } } }))
      .toContain("spells its field `fooBar` as `--foo-bar`, which its field `foo_bar` already takes");
    expect(await refused({ type: "object", properties: { JSON: { type: "string" } } }))
      .toContain("spells its field `JSON` as `--json`, which the command line itself already takes");
    expect(await refused({ $ref: "#/$defs/input", $defs: { input: { type: "object", properties: { json: { type: "boolean" } }, required: ["json"] } } }))
      .toContain("spells its field `json` as `--json`");
  });

  it("keeps a plugin's operation local-only in amy contract unless it says otherwise", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo({
      operations: [greet, otherOperation("demo.open", ["demo-open"], { localOnly: false })],
    })));
    const document = installContract(gathered.contributions) as { paths: Record<string, Record<string, Record<string, unknown>>> };
    expect(document.paths["/demo/greetings"]?.post?.["x-amy-local-only"]).toBe(true);
    expect(document.paths["/demo/open"]?.get?.["x-amy-local-only"]).toBe(false);
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

  it("runs the plugin's setup with its settings and a runner, and reports one that throws without stopping the next", async () => {
    const ran: string[] = [];
    const plugin = demo({
      setup: [
        {
          name: "breaks",
          run() {
            throw new Error("the other program is not installed");
          },
        },
        {
          name: "prepares",
          async run({ settings, runner }) {
            const result = await runner.run("other-program", ["profile", "create", String(settings.greeting)]);
            ran.push(result.stdout);
            return { label: "prepares", ok: true, detail: "made it" };
          },
        },
      ],
    });
    const gathered = await gather(CONFIG, [WORK], loading(plugin));
    const { out, said } = spoken();
    const runner = { run: async (command: string, args: readonly string[]) => ({ ok: true, exitCode: 0, stdout: `${command} ${args.join(" ")}`, stderr: "" }) };

    const answered = await runSetup("/amy", CONFIG, WORK, gathered.contributions, out, runner);

    expect(answered.map((one) => [one.label, one.ok])).toEqual([
      ["@acme/plugin-demo: breaks", false],
      ["@acme/plugin-demo: prepares", true],
    ]);
    expect(ran).toEqual(["other-program profile create hello"]);
    expect(said.join("\n")).toContain("could not set up @acme/plugin-demo: breaks — the other program is not installed");
    expect(said.join("\n")).toContain("set up @acme/plugin-demo: prepares — made it");
  });

  it("runs no setup for a profile that does not mount the plugin", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo({ setup: [{ name: "x", run: () => ({ label: "x", ok: true }) }] })));
    const other: Profile = { ...WORK, name: "other", plugins: [] };

    expect(await runSetup("/amy", CONFIG, other, gathered.contributions, spoken().out, { run: async () => { throw new Error("ran"); } })).toEqual([]);
  });

  it("refuses a file that would land outside the profile that mounted it", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-escape-"));
    const gathered = await gather(CONFIG, [WORK], loading(demo({ files: [{ path: "../elsewhere.txt", content: "no\n" }] })));
    const { out } = spoken();

    expect(() => writeFiles(home, CONFIG, WORK, gathered.contributions, out)).toThrow(/outside the profile/);
    expect(fs.existsSync(path.join(home, "elsewhere.txt"))).toBe(false);

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("keeps a root file an older install left behind, in the profile that owns it now", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-migrate-"));
    fs.writeFileSync(path.join(home, "demo.txt"), "the team's own\n", "utf-8");
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const { out } = spoken();

    migrateRootFiles(home, gathered.contributions, out);

    expect(fs.readFileSync(path.join(home, "work", "demo.txt"), "utf-8")).toBe("the team's own\n");
    expect(fs.existsSync(path.join(home, "demo.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(home, "demo.txt.moved"), "utf-8")).toBe("the team's own\n");

    // What was already there wins, a file that never lived at the root is
    // not migrated from a root file that happens to share its name, and the
    // moved name is gone: the second run has nothing to read and nothing to
    // move, leaving the profile's copy and the moved one exactly as they were.
    fs.writeFileSync(path.join(home, "work", "demo.txt"), "edited later\n", "utf-8");
    migrateRootFiles(home, gathered.contributions, out);
    expect(fs.readFileSync(path.join(home, "work", "demo.txt"), "utf-8")).toBe("edited later\n");
    expect(fs.readFileSync(path.join(home, "demo.txt.moved"), "utf-8")).toBe("the team's own\n");

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("gives the same root file to every profile that claims it, before retiring it once", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-migrate-"));
    fs.writeFileSync(path.join(home, "team.yaml"), "the team's own\n", "utf-8");
    const { out } = spoken();
    const second: Profile = { name: "other", workflow: "@acme/workflow-unheard-of", plugins: [], takesNotes: false, takesTasks: false, settings: {} };

    const copied = migrateRootFiles(
      home,
      [
        {
          owner: "@acme/plugin-demo",
          spec: "@acme/plugin-demo",
          plugin: demo(),
          profiles: [WORK],
          operations: [],
          checks: [],
          files: [{ path: "team.yaml", content: () => "the team's own\n" }],
          setup: [],
        },
        {
          owner: "@acme/plugin-second",
          spec: "@acme/plugin-second",
          plugin: demo({ name: "@acme/plugin-second" }),
          profiles: [second],
          operations: [],
          checks: [],
          files: [{ path: "./team.yaml", content: () => "the team's own\n" }],
          setup: [],
        },
      ],
      out,
    );

    expect(fs.readFileSync(path.join(home, "work", "team.yaml"), "utf-8")).toBe("the team's own\n");
    expect(fs.readFileSync(path.join(home, "other", "team.yaml"), "utf-8")).toBe("the team's own\n");
    // The root name retires once, whatever claimed it, and both profiles read
    // their own copy from then on.
    expect(copied).toContain(path.join(home, "team.yaml.moved"));
    expect(fs.existsSync(path.join(home, "team.yaml"))).toBe(false);

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("refuses to overwrite a name that is already retired, and keeps the reappeared copy for a person", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-migrate-"));
    fs.writeFileSync(path.join(home, "demo.txt.moved"), "the archived team\n", "utf-8");
    fs.writeFileSync(path.join(home, "demo.txt"), "the copy that came back\n", "utf-8");
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const { out, said } = spoken();

    migrateRootFiles(home, gathered.contributions, out);

    // The archive is the older list and the machine's copy came back: both
    // stay, since deciding between them is a person's call, not an update's.
    expect(fs.readFileSync(path.join(home, "demo.txt"), "utf-8")).toBe("the copy that came back\n");
    expect(fs.readFileSync(path.join(home, "demo.txt.moved"), "utf-8")).toBe("the archived team\n");
    expect(said.some((line) => line.includes("already an archived copy"))).toBe(true);

    fs.rmSync(home, { recursive: true, force: true });
  });

  it("leaves the machine's own environment file to the machine, whatever a plugin declares", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-migrate-"));
    // The machine's credentials live where the host's loader reads them for
    // every invocation; retiring that name would starve the host of them.
    fs.writeFileSync(path.join(home, ".env"), "LINEAR_API_KEY=the-machine's\n", "utf-8");
    const { out } = spoken();

    const copied = migrateRootFiles(
      home,
      [
        {
          owner: "@acme/plugin-credentials",
          spec: "@acme/plugin-credentials",
          plugin: demo({ name: "@acme/plugin-credentials" }),
          profiles: [WORK],
          operations: [],
          checks: [],
          files: [{ path: ".env", content: () => "an example's placeholders\n" }],
          setup: [],
        },
      ],
      out,
    );

    expect(copied).toEqual([]);
    expect(fs.readFileSync(path.join(home, ".env"), "utf-8")).toBe("LINEAR_API_KEY=the-machine's\n");
    expect(fs.existsSync(path.join(home, ".env.moved"))).toBe(false);

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

  it("gets btw, note, roster, worktrees and models from the packages that own them, as operations", async () => {
    const { plugin: errand } = await import("@amykit/workflow-errand");
    const { plugin: plans } = await import("@amykit/workflow-note-to-plan");
    const { plugin: tickets } = await import("@amykit/workflow-ticket-to-qa");
    const { plugin: worktrees } = await import("@amykit/plugin-file-worktree");
    const { plugin: relay } = await import("@amykit/plugin-agent-relay");
    const words = (plugin: Plugin) => (plugin.operations ?? []).map((operation) => (operation as { cli?: { words: string[] } }).cli?.words.join(" "));

    expect(words(errand)).toEqual(["btw"]);
    expect(words(plans)).toEqual(["note"]);
    expect(words(tickets)).toEqual(["roster show", "roster confirm"]);
    expect(words(worktrees)).toEqual(["worktrees list", "worktrees remove", "worktrees prune"]);
    expect(words(relay)).toEqual(["models show", "models refresh"]);
    for (const plugin of [errand, plans, tickets, worktrees, relay]) expect((plugin as { commands?: unknown }).commands).toBeUndefined();
  });
});

/** An operation over a hand-written input schema, so its shape is exactly the one under test. */
function spelledOver(input: Record<string, unknown>) {
  const schema = {
    "~standard": { version: 1, vendor: "test", validate: (value: unknown) => ({ value }), jsonSchema: { input: () => input, output: () => ({ type: "object" }) } },
  } as unknown as OperationSchema;
  return defineOperation({
    id: "demo.spelled",
    domain: "demo",
    summary: "Spelled over a schema",
    description: "Answers its input. Changes nothing.",
    input: schema,
    output: schema,
    writes: [],
    http: { method: "post", path: "/demo/spelled" },
    cli: { words: ["spelled"] },
    examples: [{ summary: "anything", input: {}, output: {} }],
    async handler(given) {
      return given;
    },
  });
}
