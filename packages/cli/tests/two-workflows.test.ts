import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandResult, HostServices, Mounted, RunOptions, mount, unmetNeeds } from "@amy/core";
import { FileEventLog } from "@amy/plugin-file-log";
import { FileNotes } from "@amy/plugin-file-notes";
import { FileQueue } from "@amy/plugin-file-queue";
import { FileStore } from "@amy/plugin-file-store";
import { PlanRecord } from "@amy/workflow-note-to-plan";
import { TickResult } from "@amy/plugin-serial-engine";
import { DEFAULT_CONFIG } from "../src/config.js";
import { load } from "../src/loader.js";
import { Profile, directoriesFor, profiles } from "../src/profiles.js";
import { pluginList, pluginSlices } from "../src/slices.js";

const ROSTER = {
  confirmedOn: "2026-09-04",
  reviewers: [{ tracker: "ada@example.test", host: "ada", available: true }],
  qa: { tracker: "grace@example.test", host: "grace", available: true },
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  repos: ["acme/widgets"],
  gate: { "acme/widgets": ["npm test"] },
  workspaceRoot: "/checkouts",
  notify: { tracker: true, hermes: null, inbox: false },
  plans: {
    ...DEFAULT_CONFIG.plans,
    repos: ["acme/amy", "acme/software-factory"],
    check: { default: ["sf check"] },
  },
  // Pointed at a port nothing is listening on, so the tracker is reachable
  // only in the sense that trying takes no time. No test here should touch
  // the network, and the one that needs a broken tick needs it to break fast.
  plugins: {
    "@amy/plugin-linear": {
      workingStatusName: "In Progress",
      repoByTeam: {},
      defaultRepo: "acme/widgets",
      endpoint: "http://127.0.0.1:1/graphql",
    },
  },
};

const TICKETS = profiles(CONFIG)["ticket-to-qa"]!;
const PLANS = profiles(CONFIG)["note-to-plan"]!;

const OK: CommandResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };

/** What `claude -p --output-format json` prints when it has done the work. */
const CLAUDE_ENVELOPE = JSON.stringify({
  result: "I wrote plans/the-slug.md and its line in next-steps.md",
  is_error: false,
  total_cost_usd: 0.42,
  duration_ms: 4321,
  usage: { input_tokens: 1000, output_tokens: 500 },
});

/**
 * The world the mounted machine reaches, as one scripted process runner.
 *
 * Every adapter in this workspace reaches the outside through `CommandRunner`
 * or `GraphQLClient`, which is what lets a whole install be driven here with
 * no network, no credential and no `claude` on the PATH.
 */
class World {
  readonly calls: { command: string; args: string[]; options?: RunOptions }[] = [];
  /** What `sf check` says when it is asked. */
  checkPasses = true;
  /** Whether the plan's branch already has a pull request. */
  pullRequestExists = false;

  run = async (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ): Promise<CommandResult> => {
    this.calls.push({ command, args: [...args], options });

    if (command === "claude") return { ...OK, stdout: CLAUDE_ENVELOPE };

    if (command === "sh" && args[1]?.includes("sf check")) {
      return this.checkPasses
        ? { ...OK, stdout: "33 rules, no findings" }
        : { ok: false, exitCode: 1, stdout: "L4.PLAN_DECLARES_EXIT_CONDITION", stderr: "" };
    }

    // The agent wrote something, so there is a change to commit and push.
    if (command === "git" && args.includes("--porcelain")) {
      return { ...OK, stdout: " M plans/the-slug.md" };
    }

    if (command === "gh") return { ...OK, stdout: this.gh(args) };

    return OK;
  };

  private gh(args: readonly string[]): string {
    if (args.includes("graphql")) {
      return JSON.stringify({
        data: {
          repository: {
            pullRequests: {
              nodes: this.pullRequestExists
                ? [
                    {
                      number: 12,
                      isDraft: false,
                      reviewDecision: null,
                      headRefOid: "abc",
                      reviewRequests: { nodes: [] },
                      reviews: { nodes: [] },
                      reviewThreads: { nodes: [] },
                    },
                  ]
                : [],
            },
          },
        },
      });
    }

    if (args.some((arg) => arg.endsWith("/pulls"))) {
      this.pullRequestExists = true;
      return JSON.stringify({ number: 12 });
    }

    return JSON.stringify({ default_branch: "main" });
  }

  /** Every argv given to one command, so an assertion can read what happened. */
  argvTo(command: string): string[][] {
    return this.calls.filter((call) => call.command === command).map((call) => call.args);
  }

  /** What each run of one command was actually asked, which arrives on stdin. */
  promptsTo(command: string): string[] {
    return this.calls
      .filter((call) => call.command === command)
      .map((call) => call.options?.stdin ?? "");
  }
}

describe("two workflows, one machine", () => {
  let root: string;
  let world: World;
  let host: HostServices;
  let previousKey: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-two-"));
    world = new World();
    previousKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "lin_api_test";
    host = {
      runner: { run: world.run },
      now: () => new Date("2026-09-04T20:00:00.000Z"),
      // One log for both profiles, which is what makes "the same budget" a
      // fact rather than a claim: the ceiling is measured off the log.
      log: new FileEventLog(path.join(root, ".amy", "log")),
      paths: { workspace: "/checkouts", state: path.join(root, ".amy") },
    };
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previousKey;
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function assemble(profile: Profile): Promise<Mounted> {
    const specs = pluginList(CONFIG, profile);
    const loaded = await load(specs);
    expect(loaded.problems).toEqual([]);

    const roster = {
      name: "@amy/cli",
      version: "0.1.0",
      register: (r: Parameters<(typeof loaded.plugins)[0]["register"]>[0]) =>
        r.contribute("workflow-data", "roster", { read: () => ROSTER }),
    };

    const outcome = await mount([...loaded.plugins, roster], pluginSlices(CONFIG, profile), host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    return outcome.mounted;
  }

  it("assembles each workflow without a single problem", async () => {
    expect((await assemble(TICKETS)).workflow?.name).toBe("ticket-to-qa");
    expect((await assemble(PLANS)).workflow?.name).toBe("note-to-plan");
  });

  it("leaves nothing either workflow named unmet", async () => {
    for (const profile of [TICKETS, PLANS]) {
      const mounted = await assemble(profile);
      expect(unmetNeeds(mounted, mounted.workflow!)).toEqual([]);
    }
  });

  it("drives both with the same engine, and it is the one from the same package", async () => {
    // The claim the seam was built to be able to make. Nothing in
    // plugins/serial-engine knows either workflow's vocabulary, so the same
    // engine object shape drives both.
    const ticket = await assemble(TICKETS);
    const note = await assemble(PLANS);

    expect(ticket.plugins.map((p) => p.name)).toContain("@amy/plugin-serial-engine");
    expect(note.plugins.map((p) => p.name)).toContain("@amy/plugin-serial-engine");
    expect(typeof ticket.engine?.tick).toBe("function");
    expect(typeof note.engine?.tick).toBe("function");
  });

  it("mounts the forge once, from one plugin, for both", async () => {
    const ticket = await assemble(TICKETS);
    const note = await assemble(PLANS);

    for (const mounted of [ticket, note]) {
      expect(mounted.ports.get("code-host")?.constructor.name).toBe("GitHubCodeHost");
      expect(mounted.plugins.map((p) => p.name)).toContain("@amy/plugin-github");
    }
  });

  it("mounts the same relay behind the agent port for both", async () => {
    const ticket = await assemble(TICKETS);
    const note = await assemble(PLANS);

    // One port, two levels of it. The ticket workflow reaches for `implement`,
    // the plan workflow for `ask`, and both are the same ladder underneath.
    expect(typeof (ticket.ports.get("agent") as { implement?: unknown }).implement).toBe(
      "function",
    );
    expect(typeof (note.ports.get("agent") as { ask?: unknown }).ask).toBe("function");
    expect(typeof (ticket.ports.get("agent") as { ask?: unknown }).ask).toBe("function");
  });

  it("gives each workflow its own records and its own queue under one .amy", async () => {
    await assemble(TICKETS);
    await assemble(PLANS);

    expect(directoriesFor(TICKETS.name)).not.toEqual(directoriesFor(PLANS.name));
    for (const profile of [TICKETS, PLANS]) {
      const dirs = directoriesFor(profile.name);
      expect(fs.existsSync(path.join(root, ".amy", dirs.records))).toBe(true);
      expect(fs.existsSync(path.join(root, ".amy", dirs.queue))).toBe(true);
    }
  });
});

describe("a note reaching a pull request", () => {
  let root: string;
  let world: World;
  let host: HostServices;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-note-"));
    world = new World();
    host = {
      runner: { run: world.run },
      now: () => new Date("2026-09-04T20:00:00.000Z"),
      log: new FileEventLog(path.join(root, ".amy", "log")),
      paths: { workspace: "/checkouts", state: path.join(root, ".amy") },
    };
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function engine() {
    const specs = pluginList(CONFIG, PLANS);
    const loaded = await load(specs);
    const outcome = await mount(loaded.plugins, pluginSlices(CONFIG, PLANS), host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    return outcome.mounted.engine!;
  }

  const place = () => ({
    notes: path.join(root, ".amy", "notes"),
    queue: path.join(root, ".amy", directoriesFor(PLANS.name).queue),
    records: path.join(root, ".amy", directoriesFor(PLANS.name).records),
  });

  /** What `amy note` does: write it down, and put it on the queue. */
  function inject(text: string, repo = "acme/amy"): string {
    const now = new Date("2026-09-04T20:00:00.000Z");
    const note = new FileNotes(place().notes, { defaultRepo: repo }).write(
      { repo, text, source: "somebody at a keyboard" },
      now,
    );
    new FileQueue(place().queue).enqueue({ workId: note.id, reason: "written down by hand" }, now);
    return note.id;
  }

  async function drive(limit = 12): Promise<TickResult[]> {
    const driver = await engine();
    const results: TickResult[] = [];

    for (let move = 0; move < limit; move += 1) {
      const result = (await driver.tick()) as TickResult;
      results.push(result);
      if (result.kind === "idle" || result.kind === "failed") break;
    }

    return results;
  }

  const stateOf = (id: string): string | undefined =>
    new FileStore<PlanRecord>(place().records).load(id)?.state;

  it("advances work injected by command, with no tracker anywhere in it", async () => {
    const id = inject("the gate output is truncated before the agent ever sees it");

    await drive();

    expect(stateOf(id)).toBe("DONE");
    expect(world.argvTo("gh").flat().join(" ")).not.toContain("linear");
  });

  it("finds a note dropped straight into the watched directory", async () => {
    fs.mkdirSync(place().notes, { recursive: true });
    fs.writeFileSync(
      path.join(place().notes, "by-hand.md"),
      "---\nrepo: acme/amy\n---\n\nthe relay retries a harness that is out of quota\n",
      "utf-8",
    );

    const driver = await engine();

    expect(await driver.discover()).toEqual(["by-hand"]);
  });

  it("spends the agent through the relay, on the prompt this workflow wrote", async () => {
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const asked = world.calls.filter((call) => call.command === "claude");
    expect(asked).toHaveLength(1);
    expect(asked[0]?.args).toContain("--output-format");
  });

  it("runs the repository's own check before anything reaches a pull request", async () => {
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const checked = world.calls.findIndex((c) => c.args[1]?.includes("sf check"));
    const opened = world.calls.findIndex((c) => c.args.some((a) => a.endsWith("/pulls")));

    expect(checked).toBeGreaterThanOrEqual(0);
    expect(opened).toBeGreaterThan(checked);
  });

  it("sends a red check back to the agent rather than to a pull request", async () => {
    world.checkPasses = false;
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    expect(world.calls.some((c) => c.args.some((a) => a.endsWith("/pulls")))).toBe(false);
    expect(world.calls.filter((c) => c.command === "claude").length).toBeGreaterThan(1);
  });

  it("tells the agent what the check said, verbatim", async () => {
    world.checkPasses = false;
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    // Nobody invented a rubric for this. What comes back is what the
    // repository's own check said, and it is what the agent is sent back with.
    const prompts = world.promptsTo("claude");
    expect(prompts[0]).not.toContain("L4.PLAN_DECLARES_EXIT_CONDITION");
    expect(prompts[1]).toContain("L4.PLAN_DECLARES_EXIT_CONDITION");
  });

  it("asks the first time in its own words, naming the friction and both files", async () => {
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const asked = world.promptsTo("claude")[0] ?? "";
    expect(asked).toContain("the gate output is truncated before the agent ever sees it");
    expect(asked).toContain("plans/next-steps.md");
  });

  it("writes what the agent spent into the log the budget is measured off", async () => {
    // The two profiles share one `.amy/log`, so a plan drafted here moves the
    // very same ceiling a ticket implementation moves. That is what "the same
    // budget" means.
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const lines = fs
      .readFileSync(
        path.join(root, ".amy", "log", fs.readdirSync(path.join(root, ".amy", "log"))[0]!),
        "utf-8",
      )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { kind: string; detail?: { costUsd?: number } });

    const spent = lines.filter((line) => line.kind === "agent.run");
    expect(spent).toHaveLength(1);
    expect(spent[0]?.detail?.costUsd).toBe(0.42);
  });

  it("opens the pull request in the repository the note was about", async () => {
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const opened = world.argvTo("gh").find((argv) => argv.some((a) => a.endsWith("/pulls")));
    expect(opened?.join(" ")).toContain("/repos/acme/amy/pulls");
  });

  it("names the friction in the pull request it opened", async () => {
    inject("the gate output is truncated before the agent ever sees it");

    await drive();

    const opened = world.argvTo("gh").find((argv) => argv.some((a) => a.endsWith("/pulls")));
    expect(opened?.join("\n")).toContain(
      "the gate output is truncated before the agent ever sees it",
    );
  });

  it("declines a note about a repository it does not write into, having written nothing", async () => {
    const id = inject("something about a fourth repository", "acme/somewhere-else");

    await drive();

    expect(stateOf(id)).toBe("DECLINED");
    expect(world.calls.filter((call) => call.command === "claude")).toEqual([]);
  });

  it("holds past the ceiling, and opens nothing new", async () => {
    // Two plans already in flight for that repository is the default ceiling,
    // so the third is held rather than drafted.
    const store = new FileStore<PlanRecord>(place().records);
    for (const id of ["note-a", "note-b"]) {
      store.save({
        id,
        state: "PR_OPEN",
        repo: "acme/amy",
        updatedAt: "2026-09-04T19:00:00.000Z",
        attempts: {},
        history: [],
      });
    }

    const id = inject("a third piece of friction");
    await drive(3);

    expect(stateOf(id)).toBe("NOTED");
    expect(world.calls.filter((call) => call.command === "claude")).toEqual([]);
  });
});

/**
 * The loop closing: the machine breaks, writes it down, and the other
 * workflow picks that up as work.
 *
 * Nothing in the engine knows what a note is. It says it has stopped, a
 * channel turns that into a note, and `amy discover` on the second profile
 * finds it like any other.
 */
describe("a tick that gives up", () => {
  let root: string;
  let host: HostServices;
  let previousKey: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-friction-"));
    previousKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "lin_api_test";
    host = {
      runner: {
        // A code host that is not answering, which is what a bad day looks
        // like from inside a tick.
        run: async (command: string): Promise<CommandResult> =>
          command === "gh"
            ? { ok: false, exitCode: 1, stdout: "", stderr: "gh: could not connect" }
            : OK,
      },
      now: () => new Date("2026-09-04T20:00:00.000Z"),
      log: new FileEventLog(path.join(root, ".amy", "log")),
      paths: { workspace: "/checkouts", state: path.join(root, ".amy") },
    };
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previousKey;
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function mounts(profile: Profile): Promise<Mounted> {
    const specs = pluginList(CONFIG, profile);
    const loaded = await load(specs);
    const roster = {
      name: "@amy/cli",
      version: "0.1.0",
      register: (r: Parameters<(typeof loaded.plugins)[0]["register"]>[0]) =>
        r.contribute("workflow-data", "roster", { read: () => ROSTER }),
    };

    const outcome = await mount([...loaded.plugins, roster], pluginSlices(CONFIG, profile), host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    return outcome.mounted;
  }

  /** Fails the ticket profile's tick until it is past the ceiling. */
  async function breakIt(): Promise<void> {
    const mounted = await mounts(TICKETS);
    const queue = new FileQueue(path.join(root, ".amy", directoriesFor(TICKETS.name).queue));

    for (let attempt = 0; attempt < CONFIG.maxItemAttempts; attempt += 1) {
      queue.enqueue(
        { workId: "PROJ-1239", reason: "discovered", attempt },
        new Date("2026-09-04T20:00:00.000Z"),
      );
      await mounted.engine!.tick();
    }
  }

  it("leaves a note behind, so the thing that broke becomes the thing that gets fixed", async () => {
    await breakIt();

    const written = new FileNotes(path.join(root, ".amy", "notes"), { defaultRepo: "" }).all();

    expect(written).toHaveLength(1);
    expect(written[0]?.text).toContain("PROJ-1239");
    expect(written[0]?.source).toContain("a tick that failed");
  });

  it("files it against the repository this machine's own failures belong to", async () => {
    await breakIt();

    const written = new FileNotes(path.join(root, ".amy", "notes"), { defaultRepo: "" }).all();

    expect(written[0]?.repo).toBe("acme/amy");
  });

  it("writes nothing while it is only retrying", async () => {
    const mounted = await mounts(TICKETS);
    const queue = new FileQueue(path.join(root, ".amy", directoriesFor(TICKETS.name).queue));

    queue.enqueue({ workId: "PROJ-1239", reason: "discovered" }, new Date());
    await mounted.engine!.tick();

    expect(new FileNotes(path.join(root, ".amy", "notes"), { defaultRepo: "" }).all()).toEqual([]);
  });

  it("is picked up by the other workflow as work, with no tracker in between", async () => {
    await breakIt();

    const plans = await mounts(PLANS);

    expect(await plans.engine!.discover()).toHaveLength(1);
  });
});
