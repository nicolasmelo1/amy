import { describe, expect, it } from "vitest";
import {
  CodeHost,
  CodeHostRefusal,
  ConfigSchema,
  HostServices,
  OpenPullRequestRequest,
  Plugin,
  PullRequestView,
  WORKFLOW_RUNTIME,
  WorkRecord,
  Workflow,
  WorkflowRuntime,
  actionsOf,
  advance,
  applyPlan,
  call,
  defineWorkflow,
  implementationOf,
  mount,
  movedBy,
  runAction,
  settled,
  withDiagram,
} from "@amykit/core";
import { conformance } from "@amykit/workflow-testkit";
import { plugin as pullRequest } from "../src/index.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-30T12:00:00.000Z"),
  paths: { workspace: "/work", checkouts: {}, state: "/state" },
};

interface MergeRequest {
  iid: number;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  draft: boolean;
}

/**
 * A second code host, shaped the way GitLab is rather than GitHub: merge
 * requests numbered by `iid`, a source and a target branch, a draft flag,
 * and links under `/-/merge_requests/`. Nothing in it knows the workflow.
 */
class MergeRequestHost implements CodeHost {
  readonly opened: MergeRequest[] = [];
  private next = 1;

  /** Set to make every read fail, the way a host that went away after answering would. */
  unreachable = false;
  /** Set to make the branch search stop finding what it opened, as a merge or a rename would. */
  forgetsBranches = false;
  forgetAfterOpening = false;

  constructor(private readonly options: { refuse?: string; down?: string; existing?: MergeRequest[] } = {}) {
    this.opened.push(...(options.existing ?? []));
  }

  async findPullRequest(repo: string, branch: string): Promise<PullRequestView | null> {
    if (this.unreachable) throw new Error("connect ECONNREFUSED");
    if (this.forgetsBranches) return null;
    const found = this.opened.find((request) => request.sourceBranch === branch);
    return found ? this.view(repo, found) : null;
  }

  async findPullRequestMentioning(repo: string, id: string): Promise<PullRequestView | null> {
    const found = this.opened.find((request) => request.title.split(/[^\w-]+/).includes(id));
    return found ? this.view(repo, found) : null;
  }

  async openPullRequest(request: OpenPullRequestRequest): Promise<number> {
    if (this.options.refuse) {
      // It answers, and then it is gone.
      this.unreachable = true;
      throw new CodeHostRefusal(this.options.refuse);
    }
    if (this.options.down) throw new Error(this.options.down);
    const iid = this.next++;
    this.forgetsBranches = this.forgetAfterOpening;
    this.opened.push({
      iid,
      sourceBranch: request.branch,
      targetBranch: request.base ?? "trunk",
      title: request.title,
      description: request.body,
      draft: request.draft ?? false,
    });
    return iid;
  }

  async pullRequest(repo: string, number: number): Promise<PullRequestView | null> {
    const found = this.opened.find((request) => request.iid === number);
    return found ? this.view(repo, found) : null;
  }

  private view(repo: string, request: MergeRequest): PullRequestView {
    return {
      number: request.iid,
      url: `https://gitlab.example/${repo}/-/merge_requests/${request.iid}`,
      headSha: "0".repeat(40),
      isDraft: request.draft,
      changedFiles: 1,
      additions: 1,
      deletions: 0,
      reviewDecision: "REVIEW_REQUIRED",
      checks: null,
      mergeState: "mergeable",
      merged: false,
      base: request.targetBranch,
      headBranch: request.sourceBranch,
      reviews: [],
      threads: [],
      requestedReviewers: [],
    };
  }

  // Everything below is the forge's other half, which opening a pull request never reaches.
  requestReview(): Promise<void> { return this.notOffered("requestReview"); }
  resolveReviewThread(): Promise<void> { return this.notOffered("resolveReviewThread"); }
  unresolveReviewThread(): Promise<void> { return this.notOffered("unresolveReviewThread"); }
  reviewLoad(): Promise<Record<string, number>> { return this.notOffered("reviewLoad"); }
  reviewsRequestedOf(): Promise<never[]> { return this.notOffered("reviewsRequestedOf"); }
  changesRequestedOf(): Promise<never[]> { return this.notOffered("changesRequestedOf"); }
  merge(): Promise<void> { return this.notOffered("merge"); }
  submitReview(): Promise<void> { return this.notOffered("submitReview"); }
  createIssue(): Promise<number> { return this.notOffered("createIssue"); }
  commitStatuses(): Promise<never[]> { return this.notOffered("commitStatuses"); }

  private notOffered(method: string): never {
    throw new Error(`the pull-request workflow called ${method}, which opening a pull request never needs`);
  }
}

/** The same host with the optional method taken away, as a host that cannot search titles would be. */
function withoutTitleSearch(host: MergeRequestHost): CodeHost {
  return new Proxy(host, {
    get: (target, key) => (key === "findPullRequestMentioning" ? undefined : Reflect.get(target, key, target)),
    has: (target, key) => key !== "findPullRequestMentioning" && Reflect.has(target, key),
  });
}

type Shipping = WorkRecord & { state: "READY" | "OPEN" | "SHIPPED" | "STOPPED"; number?: number; url?: string; reason?: string };

/** A caller that hands a branch to the pull-request workflow and keeps what comes back. */
function shipping(options: { draft?: boolean; mentions?: string } = {}): Plugin {
  return withDiagram(defineWorkflow({
    name: "shipping",
    configSchema: {} satisfies ConfigSchema,
    policy: {},
    needs: {},
    codeHostWrites: ["open-pull-request"],
    calls: {
      OPEN: call(pullRequest, {
        input: () => ({
          repo: "acme/widgets",
          branch: "amy/fix-the-gate",
          title: "Fix the gate (TBO-7)",
          body: "the gate output was truncated",
          base: "trunk",
          ...(options.mentions ? { mentions: options.mentions } : {}),
        }),
        config: { draft: options.draft ?? false },
        output: {
          OPENED: (work: Shipping, out) => ({ ...work, number: out.number, url: out.url }),
          REFUSED: (work: Shipping, out) => ({ ...work, reason: out.reason }),
        },
      }),
    },
    decide: {
      READY: () => advance("OPEN", "the branch is pushed"),
      SHIPPED: () => settled("shipped"),
      STOPPED: () => settled("stopped"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
  }), `stateDiagram-v2
    [*] --> READY
    READY --> OPEN
    OPEN --> SHIPPED: OPENED
    OPEN --> STOPPED: REFUSED
    SHIPPED --> [*]
    STOPPED --> [*]
    class OPEN call
`);
}

function forge(host: CodeHost): Plugin {
  return { name: "forge", register: (registry) => registry.port("code-host", host) };
}

async function mounted(plugins: readonly Plugin[]): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const outcome = await mount(plugins, {}, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

async function shipped(plugins: readonly Plugin[]): Promise<Shipping> {
  const { workflow, runtime } = await mounted(plugins);
  let record = runtime.newRecord("TBO-7", HOST.now());
  for (let look = 0; look < 30; look += 1) {
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    if (plan.kind === "settled") return record as Shipping;
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
    }
    record = runtime.apply(applyPlan(record, plan, HOST.now(), outcomes), plan, outcomes, observation, HOST.now(), movedBy(record, plan));
  }
  throw new Error(`did not settle; last in ${record.state}`);
}

describe("the pull-request workflow on a code host that is not GitHub", () => {
  it("opens a merge request through the port, and returns its number and link", async () => {
    const host = new MergeRequestHost();

    const record = await shipped([shipping(), forge(host)]);

    expect(record.state).toBe("SHIPPED");
    expect([record.number, record.url]).toEqual([1, "https://gitlab.example/acme/widgets/-/merge_requests/1"]);
    expect(host.opened).toEqual([{
      iid: 1,
      sourceBranch: "amy/fix-the-gate",
      targetBranch: "trunk",
      title: "Fix the gate (TBO-7)",
      description: "the gate output was truncated",
      draft: false,
    }]);
    expect(record.calls!["TBO-7/OPEN#1"]!.state).toBe("OPENED");
  });

  it("opens it as a draft when the call site says so", async () => {
    const host = new MergeRequestHost();

    await shipped([shipping({ draft: true }), forge(host)]);

    expect(host.opened.map((request) => request.draft)).toEqual([true]);
  });

  it("finds the one somebody opened from a renamed branch by the id its title names, rather than opening a second", async () => {
    const existing = { iid: 4, sourceBranch: "renamed", targetBranch: "trunk", title: "Fix the gate (TBO-7)", description: "", draft: false };
    const host = new MergeRequestHost({ existing: [existing] });

    const record = await shipped([shipping({ mentions: "TBO-7" }), forge(host)]);

    expect(record.number).toBe(4);
    expect(host.opened).toHaveLength(1);
  });

  it("returns REFUSED with the host's own reason the first time it answers that it will not", async () => {
    const host = new MergeRequestHost({ refuse: "Another open merge request already exists for this source branch" });

    const record = await shipped([shipping(), forge(host)]);

    expect(record.state).toBe("STOPPED");
    expect(record.reason).toBe("Another open merge request already exists for this source branch");
    expect(record.calls!["TBO-7/OPEN#1"]!.attempts).toEqual({ OPENING: 1 });
  });

  it("hands back a refusal it already has without asking the host again, even when the host is gone", async () => {
    const host = new MergeRequestHost({ refuse: "Pull request creation is disabled" });

    const record = await shipped([shipping(), forge(host)]);

    expect(host.unreachable).toBe(true);
    expect(record.state).toBe("STOPPED");
  });

  it("finds the one it opened by its number once the branch search no longer does", async () => {
    const host = new MergeRequestHost();
    host.forgetAfterOpening = true;

    const record = await shipped([shipping(), forge(host)]);

    expect(record.state).toBe("SHIPPED");
    expect(record.number).toBe(1);
    expect(host.opened).toHaveLength(1);
  });

  it("fails the look when the host is down, so the engine retries it rather than calling it a refusal", async () => {
    const host = new MergeRequestHost({ down: "502 Bad Gateway" });

    await expect(shipped([shipping(), forge(host)])).rejects.toThrow("502 Bad Gateway");
  });

  it("is refused at boot by a host missing a capability it declares, naming it", async () => {
    const outcome = await mount([shipping(), forge(withoutTitleSearch(new MergeRequestHost()))], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("; ")).toContain(
      "shipping → OPEN: needs code-host to offer `findPullRequestMentioning`, and the mounted one does not",
    );
  });

  it("conforms to the machine inside its caller, every arrow either draws walked", async () => {
    const opens = await mounted([shipping(), forge(new MergeRequestHost())]);
    const refuses = await mounted([shipping(), forge(new MergeRequestHost({ refuse: "no" }))]);

    const findings = await conformance(opens.workflow, {
      runtime: (world: { name: string; workId: string; runtime: WorkflowRuntime }) => world.runtime,
      worlds: [
        { name: "a host that opens it", workId: "TBO-7", runtime: opens.runtime },
        { name: "a host that refuses it", workId: "TBO-7", runtime: refuses.runtime },
      ],
      everyEdge: true,
    });

    expect(findings).toEqual([]);
  });
});
