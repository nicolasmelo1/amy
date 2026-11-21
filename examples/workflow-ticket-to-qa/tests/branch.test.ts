import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodeHost, Plugin, WORKFLOW_RUNTIME, Workflow, WorkflowRuntime, mount } from "@amykit/core";
import { fakeAgent, fakeGate, fakeGit, fakeHost, fakeTracker, fakeWorkspace, pullRequest, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { newRecord, plugin } from "./drawn.js";
import type { Ticket } from "../src/ticket.js";

const clock = new Date("2026-10-03T12:00:00.000Z");

describe("a ticket whose tracker derived no branch", () => {
  it("is refused on its first look, naming the field, before any branch is prepared", async () => {
    const git = fakeGit();
    const { runtime } = (await ticketWorkerDeps({
      tracker: fakeTracker({ get: async () => ({ ...ticket(), branchName: undefined }) }),
      git,
      now: () => clock,
    }));

    await expect(runtime.observe(newRecord("PROJ-1239", clock))).rejects.toThrow(/PROJ-1239 has no `branchName`/);
    expect(git.prepareBranch).not.toHaveBeenCalled();
    expect(git.commitAndPush).not.toHaveBeenCalled();
  });
});


const PARENT = "PROJ-1000";
const PARENT_BRANCH = "ada/proj-1000-the-parent";
const REPO = "Northwind/northwind-backend";

/** The child, saying its stack base in its description, and the parent it names. */
const child = (body = `Fix the total.\n\nStack base: ${PARENT}`, over: Partial<Ticket> = {}): Ticket => ticket({ body, repo: REPO, ...over });
const parent = (over: Partial<Ticket> = {}): Ticket => ticket({ id: PARENT, title: "The parent", branchName: PARENT_BRANCH, repo: REPO, ...over });

/** A code host where the parent has the pull request given, found by its branch or by its id, and the child has none. */
function hostWith(parentPr: ReturnType<typeof pullRequest> | null): CodeHost {
  const forParent = (asked: string) => asked === PARENT_BRANCH || asked === PARENT;
  return fakeHost(null, {
    findPullRequest: vi.fn(async (_repo: string, branch: string) => (forParent(branch) ? parentPr : null)),
    findPullRequestMentioning: vi.fn(async (_repo: string, id: string) => (forParent(id) ? parentPr : null)),
  } as Partial<CodeHost>);
}

/** ticket-to-qa mounted with the settings given, its git a recorded runner. */
async function stacked(tickets: Ticket[], host: CodeHost, settings: Record<string, unknown> = {}) {
  const commands: string[] = [];
  const byId = new Map(tickets.map((one) => [one.id, one]));
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      registry.port("tracker", fakeTracker({ get: vi.fn(async (id: string) => byId.get(id) ?? null), inProgress: vi.fn(async () => tickets) }));
      registry.port("code-host", host);
      registry.port("agent", fakeAgent());
      registry.port("gate", fakeGate());
      registry.port("notifier", { announce: async () => {} });
    },
  };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "amy-stack-"));
  fs.writeFileSync(path.join(profile, "roster.yaml"), 'confirmedOn: "2026-10-03"\nreviewers:\n  - { tracker: ada@example.test, host: ada, available: true }\nqa: { tracker: grace@example.test, host: grace, available: true }\n');
  const outcome = await mount([fakeWorkspace(), plugin, world], {
    "@amykit/workflow-ticket-to-qa": {
      repos: [REPO],
      qaStatusName: "In QA",
      escalation: { scale: { patient: 3, normal: 2, immediate: 1 } },
      ...settings,
    },
  }, {
    runner: {
      run: async (command: string, args: readonly string[]) => {
        commands.push([command, ...args].join(" "));
        return { ok: true, exitCode: 0, stdout: args.includes("status") ? " M invoice.md\n" : args.includes("rev-parse") ? "c0ffee0000000000000000000000000000000000\n" : "", stderr: "" };
      },
    },
    now: () => clock,
    paths: { state: profile, profile },
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;
  return { workflow, runtime, commands };
}

/** One look at READY and the implementation that follows, as far as it goes. */
async function cut(world: Awaited<ReturnType<typeof stacked>>) {
  const ready = { ...newRecord("PROJ-1239", clock), state: "IMPLEMENTING" };
  const seen = await world.runtime.observe(ready);
  const decided = world.workflow.plan(ready, seen, world.runtime.policy);
  if (decided.kind === "act") {
    for (const effect of decided.effects) {
      const action = world.runtime.actions[effect.type] as ((e: unknown, c: unknown) => Promise<void>) | undefined;
      if (action) await action(effect, { record: ready, observation: seen, outcomes: {} });
    }
  }
  return decided;
}

describe("a stacked ticket", () => {
  it("is cut from its parent's open pull request branch, named in a Stack base line", async () => {
    const world = await stacked([child(), parent()], hostWith(pullRequest({ headBranch: PARENT_BRANCH })));

    await cut(world);

    expect(world.commands.some((command) => command.includes(PARENT_BRANCH))).toBe(true);
  });

  it("is cut from its parent's branch when the config's stackBases names the parent", async () => {
    const world = await stacked([child("Fix the total."), parent()], hostWith(pullRequest({ headBranch: PARENT_BRANCH })), { stackBases: { "PROJ-1239": PARENT } });

    await cut(world);

    expect(world.commands.some((command) => command.includes(PARENT_BRANCH))).toBe(true);
  });

  it("is cut from the branch its parent merged into, once the parent merged", async () => {
    const world = await stacked([child(), parent()], hostWith(pullRequest({ headBranch: PARENT_BRANCH, merged: true, base: "release/2026-10" })));

    await cut(world);

    expect(world.commands.some((command) => command.includes("release/2026-10"))).toBe(true);
  });

  it("waits, naming the parent, while the parent has no pull request in its repository", async () => {
    const world = await stacked([child(), parent()], hostWith(null));

    const decided = await cut(world);

    expect(decided.kind).toBe("wait");
    expect(decided.why).toContain(PARENT);
  });
});
