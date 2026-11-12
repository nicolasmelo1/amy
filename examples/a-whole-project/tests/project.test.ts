import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BriefRecord,
  CodeHost,
  CommandRunner,
  HarnessReply,
  HostServices,
  PullRequestView,
  Tracker,
  Plugin,
  WORKFLOW_RUNTIME,
  WORKSPACE_PORT,
  Workflow,
  WorkflowRuntime,
  WorkRecord,
  actionsOf,
  applyPlan,
  defineOperation,
  implementationOf,
  mount,
  movedBy,
  runAction,
  unmetNeeds,
} from "@amykit/core";
import { RecordingNotifier, fakeGate, fakeHost, fakeRun, fakeTracker, pullRequest, ticket } from "@amykit/test-fixtures";
import { ProofStore } from "@amykit/plugin-prove";
import { briefsOf, checkBrief, composeProject, composedPluginName, operationsOffered } from "../../../packages/cli/src/project.js";
import { plugin as brief } from "../brief/index.js";
import { plugin as work } from "../workflow/index.js";
import { plugin as prove } from "../prove/index.js";

const UNIT = "SHOP-1";
/** A Thursday: the roster is confirmed by the day, and a weekend asks for it again. */
const START = new Date("2026-11-12T12:00:00.000Z");
const BOT = "copilot-pull-request-reviewer[bot]";

/**
 * The ticket's world, doing what the people around it would: Copilot reviews
 * each head it is shown, and the reviewer amy asks approves. The tracker
 * knows `SHOP-1` and nothing else, so a phase that asked it for its call's
 * id would stop on its first look, as 0.7.1 did.
 */
class Shop {
  readonly ticket = ticket({ id: UNIT, title: "A paid invoice says so", repo: "acme/shop", branchName: "amy/shop-1" });
  clock = START.getTime();
  pr: PullRequestView | null = null;
  handedTo: string | undefined;
  private heads = 0;
  private changed = false;
  readonly now = (): Date => new Date(this.clock);

  tracker(): Tracker {
    return fakeTracker({
      inProgress: async () => [],
      get: async (id) => (id === UNIT ? { ...this.ticket, status: this.handedTo ? "In QA" : "In Progress" } : null),
      setStatus: async () => {},
      assign: async (_id, who) => { this.handedTo = who; },
    });
  }

  host(): CodeHost {
    return fakeHost(null, {
      findPullRequest: async () => this.pr,
      pullRequest: async () => this.pr,
      openPullRequest: async (input) => {
        this.pr = pullRequest({ url: "https://forge.example.test/acme/shop/pull/1", number: 1, headBranch: input.branch, headSha: this.head() });
        return 1;
      },
      requestReview: async (_repo, _number, login) => {
        if (this.pr) this.pr = { ...this.pr, requestedReviewers: [...this.pr.requestedReviewers, login] };
      },
      reviewLoad: async () => ({ ada: 0 }),
    });
  }

  agent() {
    return {
      name: "fake",
      ask: async (_prompt: string, _cwd: string, context?: { step?: string }): Promise<HarnessReply> => {
        if (context?.step === "triage") return { text: JSON.stringify({ clear: true, questions: [] }), run: fakeRun() };
        if (context?.step === "implement") this.changed = true;
        return { text: "looks right against the ticket\nAPPROVED", run: fakeRun() };
      },
    };
  }

  /** A git whose head moves when, and only when, what the agent changed is committed. */
  git(): CommandRunner {
    return {
      run: async (_command, args) => {
        let stdout = "";
        if (args[0] === "status") stdout = this.changed ? " M invoice.ts\n" : "";
        if (args[0] === "commit") {
          this.changed = false;
          this.heads += 1;
        }
        if (args[0] === "rev-parse") stdout = `${this.head()}\n`;
        return { ok: true, exitCode: 0, stdout, stderr: "" };
      },
    };
  }

  /** What the people around the ticket do between two looks. */
  moves(): void {
    const pr = this.pr;
    const at = this.now().toISOString();
    if (!pr) return;
    if (!pr.reviews.some((review) => review.author === BOT && review.commitSha === pr.headSha)) {
      this.pr = { ...pr, reviews: [...pr.reviews, { author: BOT, state: "COMMENTED", commitSha: pr.headSha, submittedAt: at }] };
      return;
    }
    const reviewer = pr.requestedReviewers[0];
    if (reviewer) {
      this.pr = {
        ...pr,
        reviewDecision: "APPROVED",
        requestedReviewers: [],
        reviews: [...pr.reviews, { author: reviewer, state: "APPROVED", commitSha: pr.headSha, submittedAt: at }],
      };
    }
  }

  private head(): string {
    return String(this.heads).padStart(40, "0");
  }
}

/** The roster the work phase reads, confirmed today: who reviews, and who QA is. */
function roster(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "roster.yaml"), [
    `confirmedOn: "${START.toISOString().slice(0, 10)}"`,
    "reviewers:",
    "  - { tracker: ada@example.test, host: ada, available: true }",
    "qa: { tracker: grace@example.test, host: grace, available: true }",
    "",
  ].join("\n"));
}

/** The brief amy-groom leaves: the feature's own sections, then the proving phase's scenario. */
const GROOMED: BriefRecord = {
  id: UNIT,
  sections: [
    { name: "Goal", body: "A paid invoice says so." },
    { name: "Sources", body: "- S1: support keeps being asked whether an invoice went through" },
    { name: "Criteria", body: "- C1: a paid invoice shows a Paid badge (source: S1)" },
    { name: "Out of scope", body: "Refunds." },
    {
      name: "Scenario",
      body: [
        "name: paid-invoice-shows-paid",
        "steps:",
        "  - { id: open, operation: browser.open, input: { url: \"https://shop.localhost/invoices/1\" } }",
        "  - { id: read, operation: browser.snapshot, input: { interactive: false } }",
        "assertions:",
        "  - { id: shown, criterion: C1, step: read, path: snapshot }",
        "",
      ].join("\n"),
    },
  ],
  questions: [], explains: [], createdAt: "", updatedAt: "", revision: 4,
};

/** A browser the scenario drives, offering the operations the browser plugin does, answering from memory. */
function browser(opened: string[]): Plugin {
  const open = defineOperation({
    id: "browser.open", domain: "browser", summary: "open", description: "open",
    input: z.object({ url: z.string() }), output: z.object({ opened: z.string() }),
    writes: [], http: { method: "post", path: "/browser/open" }, examples: [],
    async handler({ url }) { opened.push(url); return { opened: url }; },
  });
  const snapshot = defineOperation({
    id: "browser.snapshot", domain: "browser", summary: "snapshot", description: "snapshot",
    input: z.object({ interactive: z.boolean().default(false) }), output: z.object({ snapshot: z.string(), refs: z.record(z.string(), z.unknown()) }),
    writes: [], http: { method: "post", path: "/browser/snapshot" }, examples: [],
    async handler() { return { snapshot: '- status "Paid" [ref=e4]', refs: { e4: { role: "status", name: "Paid" } } }; },
  });
  return { name: "browser", operations: [open, snapshot], register() {} };
}

async function mounted() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-whole-project-"));
  const artifacts = path.join(home, "projects", "shop", "artifacts");
  const briefs = new Map<string, BriefRecord>();
  const composed = composeProject({
    profile: { name: "shop", settings: { repos: ["acme/shop"], qaStatusName: "In QA" } },
    slices: {},
    phases: [
      { phase: "brief", plugin: brief, name: brief.name },
      { phase: "workflow", plugin: work, name: work.name },
      { phase: "prove", plugin: prove, name: prove.name },
    ],
    absent: {},
    root: path.resolve(import.meta.dirname, ".."),
  });
  expect(composed.problems).toEqual([]);
  const shop = new Shop();
  const ports: Record<string, object> = {
    brief: { get: async (id: string) => briefs.get(id) ?? null },
    tracker: shop.tracker(),
    "code-host": shop.host(),
    agent: shop.agent(),
    gate: fakeGate(),
    notifier: new RecordingNotifier(),
    [WORKSPACE_PORT]: { workspaceRoot: "/checkouts", checkouts: { "acme/shop": "/checkouts/shop" } },
  };
  const providers: Plugin[] = Object.entries(ports).map(([kind, impl]) => ({ name: `fake-${kind}`, register: (registry) => registry.port(kind, impl) }));
  const profile = path.join(home, "projects", "shop", "shop");
  roster(profile);
  const host: HostServices = {
    runner: shop.git(),
    now: shop.now,
    paths: { state: home, profile, artifacts },
  };
  const opened: string[] = [];
  const outcome = await mount([...providers, composed.plugin, browser(opened)], { [composedPluginName({ name: "shop" })]: { repos: ["acme/shop"], qaStatusName: "In QA" } }, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  // The check the daemon makes before it looks at anything: every action a
  // phase can plan has its port, and its catalogue entry.
  const unmet = unmetNeeds(outcome.mounted, outcome.mounted.workflow!);
  if (unmet.length > 0) throw new Error(unmet.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;
  return { workflow, runtime, briefs, opened, artifacts, composed, shop, offered: operationsOffered(outcome.mounted) };
}

type Machine = Awaited<ReturnType<typeof mounted>>;

async function look({ workflow, runtime, shop }: Machine, record: WorkRecord): Promise<WorkRecord> {
  shop.clock += 60_000;
  const now = shop.now();
  const observation = await runtime.observe(record);
  const plan = workflow.plan(record, observation, runtime.policy);
  if (plan.kind === "settled") return record;
  const outcomes: Record<string, unknown> = {};
  for (const action of actionsOf(plan)) await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
  return runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan));
}

/** The record a call state is waiting on. */
const child = (record: WorkRecord): WorkRecord => record.calls![record.calling!]!;

describe("examples/a-whole-project", () => {
  it("mounts as one profile whose record walks BRIEF, WORK, PROVE and DONE, each phase a shipped workflow", async () => {
    const machine = await mounted();
    expect(machine.workflow.states).toEqual(["BRIEF", "GROOMED", "WORK", "PROVE", "PROOF_COMPLETE", "DONE"]);
    expect([brief.name, work.name, prove.name]).toEqual(["@amykit/workflow-feature-grooming", "@amykit/workflow-ticket-to-qa", "@amykit/plugin-prove"]);

    let record = machine.runtime.newRecord(UNIT, new Date("2026-11-08T12:00:00.000Z"));
    const walked = [record.state];
    // The brief is not groomed yet: BRIEF waits on it, as a look.
    record = await look(machine, record);
    expect(record.state).toBe("BRIEF");
    expect(child(record).state).toBe("GROOMING");

    machine.briefs.set(UNIT, GROOMED);
    for (let step = 0; step < 6 && record.state !== "WORK"; step += 1) {
      record = await look(machine, record);
      if (!walked.includes(record.state)) walked.push(record.state);
    }
    expect(record.state).toBe("WORK");
    expect((record as WorkRecord & { brief?: unknown }).brief).toEqual({ criteria: ["C1"] });

    // ticket-to-qa walks its own way to the QA handoff, on its real actions:
    // the people around the ticket move between looks, and nothing is set by hand.
    for (let step = 0; step < 60 && record.state === "WORK"; step += 1) {
      record = await look(machine, record);
      machine.shop.moves();
    }
    expect(machine.shop.pr?.headBranch).toBe("amy/shop-1");
    expect(machine.shop.handedTo).toBe("grace@example.test");
    if (!walked.includes(record.state)) walked.push(record.state);
    expect(record.state).toBe("PROVE");
    expect(child(record).input).toEqual({ criteria: ["C1"], priority: 0 });

    for (let step = 0; step < 12 && record.state !== "DONE"; step += 1) {
      record = await look(machine, record);
      if (!walked.includes(record.state)) walked.push(record.state);
    }

    expect(walked).toEqual(["BRIEF", "GROOMED", "WORK", "PROVE", "PROOF_COMPLETE", "DONE"]);
    expect(machine.opened).toEqual(["https://shop.localhost/invoices/1"]);
    expect((record as WorkRecord & { prove?: { criteria?: unknown } }).prove?.criteria).toEqual(["C1"]);
    expect(new ProofStore(path.join(machine.artifacts, "proofs")).standing(UNIT, { codeDigest: null, briefRevision: 4 }).proven).toBe(true);
  });

  it("does not start the work while the brief names no scenario: it waits in GROOMED until the proving phase's check is green", async () => {
    const machine = await mounted();
    machine.briefs.set(UNIT, { ...GROOMED, sections: GROOMED.sections.filter((one) => one.name !== "Scenario") });
    let record = machine.runtime.newRecord(UNIT, new Date("2026-11-08T12:00:00.000Z"));
    for (let step = 0; step < 8; step += 1) record = await look(machine, record);

    expect(record.state).toBe("GROOMED");
    expect(record.calls ?? {}).not.toHaveProperty(`${UNIT}/WORK#1`);

    machine.briefs.set(UNIT, GROOMED);
    record = await look(machine, record);
    expect(record.state).toBe("WORK");
  });

  it("asks the brief for the proving phase's scenario, and the check is green on the groomed one", async () => {
    const machine = await mounted();
    const briefs = briefsOf(machine.composed.plugin);

    expect(briefs.flatMap((one) => one.declaration?.sections ?? [])).toEqual(["Goal", "Sources", "Criteria", "Out of scope", "Scenario"]);
    expect((await checkBrief(briefs, UNIT, GROOMED, machine.offered)).refusals).toEqual([]);
    const unscenarioed = { ...GROOMED, sections: GROOMED.sections.filter((one) => one.name !== "Scenario") };
    expect((await checkBrief(briefs, UNIT, unscenarioed, machine.offered)).refusals.map((one) => one.section)).toEqual(["Scenario"]);
  });
});
