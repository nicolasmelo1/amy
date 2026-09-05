---
title: Write a workflow
description: Your process as a package — the pure decision, the runtime, and the walkthrough test that is the only real proof.
group: Build your own
order: 2
---

# Write a workflow

A workflow is **your process**, as a package. Nothing in amy's code names the
ones it ships, and nothing will name yours either.

This page writes one end to end. There is a complete working example in the
repository that a gate drives on every run —
[`workflow-oncall/index.js`](https://github.com/nicolasmelo1/amy/blob/main/.software-factory/evidence/installed-plugins/workflow-oncall/index.js)
— installed onto a machine with no checkout on it, to prove exactly this.

`/amy-workflow` will interrogate you into a design a question at a time. This
page is what it writes.

## Before you write anything: answer five questions

A workflow that is hard to write is almost always one where these were not
settled first.

1. **What is one piece of work?** A ticket, a page, a customer, a week. It needs
   a stable id, because that id is the record's file name.
2. **What are its states?** Name them as *where it has got to*, not as *what to
   do next*. `PR_OPEN`, not `OPEN_THE_PR`.
3. **Which states wait on somebody else?** Those back off instead of spinning.
   Getting this wrong is the difference between a machine and a busy loop.
4. **Which states are terminal?** Including the ones that are terminal because
   the answer is *no*. `DECLINED` is a finished piece of work, not a failed one.
5. **What does it need to look at before deciding?** That is the observation,
   and everything in it must be gatherable without deciding anything.

## 1. The states

```ts
// src/state.ts
export const REVIEW_STATES = [
  /** A customer wrote in. Nothing has read it yet. */
  "RECEIVED",
  /** An agent is drafting a reply, or its last attempt needs looking at. */
  "DRAFTING",
  /** A draft exists and a human has to approve it before it goes out. */
  "AWAITING_APPROVAL",
  /** Terminal: it was sent. */
  "SENT",
  /** Terminal: nothing was sent, and the machine said why. */
  "DECLINED",
] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

/** Where the machine has nothing to do until somebody else moves. */
export const WAITING_STATES: readonly ReviewState[] = ["AWAITING_APPROVAL"];
```

Comment each state with *what is true when work is in it*. Six months later that
comment is the specification.

## 2. The record

```ts
// src/record.ts
import type { WorkRecord } from "@amy/core";

export interface ReviewRecord extends WorkRecord {
  state: ReviewState;
  customer: string;
  draft?: string;
  lastAttempt?: { ok: boolean; output: string; at: string };
}

export function newRecord(workId: string, now: Date): ReviewRecord {
  return {
    id: workId,
    state: "RECEIVED",
    updatedAt: now.toISOString(),
    attempts: {},
    history: [],
    customer: workId,
  };
}

/** How many times work has been looked at in one state. */
export function attemptsIn(record: ReviewRecord, state: ReviewState): number {
  return record.attempts[state] ?? 0;
}
```

The core reads exactly four fields — `state`, `updatedAt`, `attempts`,
`history` — and writes them through `applyPlan`. Everything else is yours, and
your `apply` is what folds it.

## 3. The typed effects

```ts
// src/effects.ts
import type { Plan } from "@amy/core";

export type Effect =
  | { type: "draft-plan"; prompt: string }
  | { type: "announce"; text: string };

export const USES_ACTIONS = ["draft-plan", "announce"] as const;

export const act = (why: string, ...effects: Effect[]): Plan =>
  ({ kind: "act", effects, why });
export const advance = (to: ReviewState, why: string, ...effects: Effect[]): Plan =>
  ({ kind: "advance", to, effects, why });
export const wait = (retryAfterMs: number, why: string, ...effects: Effect[]): Plan =>
  ({ kind: "wait", retryAfterMs, why, effects });
export const settled = (why: string): Plan => ({ kind: "settled", why });
```

**You compose actions; you do not define them.** Check
[the catalogue](../concepts/actions.md) first — `draft-plan` and `run-errand` both
dispatch to a generic `agent.ask()`, which is almost always what a new workflow
wants. If nothing fits, register the action *and its port* from a plugin of
yours.

`USES_ACTIONS` is declared as data so the host can refuse a mount where one of
them has no port behind it — at boot, naming the action.

## 4. The observation and the policy

```ts
// src/observation.ts
export interface Observation {
  message: { id: string; body: string; customer: string };
  approved: boolean;
  inFlight: number;
}

export interface Policy {
  maxAttempts: number;
  maxInFlight: number;
  approvalBackoffMs: number;
}

export const DEFAULT_POLICY: Policy = {
  maxAttempts: 3,
  maxInFlight: 5,
  approvalBackoffMs: 15 * 60 * 1000,
};
```

The observation is **everything from outside**, gathered before deciding. The
policy is **every number**, so none of them is buried in the logic where nobody
can change it.

## 5. The decision — and it must stay pure

```ts
// src/machine.ts
import type { Plan, Workflow } from "@amy/core";

export function plan(record: ReviewRecord, obs: Observation, policy: Policy): Plan {
  switch (record.state) {
    case "RECEIVED":
      if (obs.inFlight >= policy.maxInFlight) {
        return wait(policy.approvalBackoffMs, `${obs.inFlight} replies are already waiting`);
      }
      return advance("DRAFTING", "there is room to draft this one");

    case "DRAFTING": {
      if (record.lastAttempt?.ok) {
        return advance("AWAITING_APPROVAL", "a draft exists", {
          type: "announce",
          text: `A reply to ${obs.message.customer} is ready:\n\n${record.draft}`,
        });
      }

      const attempts = attemptsIn(record, "DRAFTING");
      if (attempts >= policy.maxAttempts) {
        return advance("DECLINED", `${attempts} attempt(s) produced nothing usable`, {
          type: "announce",
          text: `I could not draft a reply to ${obs.message.customer}. It is yours.`,
        });
      }

      return act(`attempt ${attempts + 1}`, {
        type: "draft-plan",
        prompt: `Draft a reply to:\n\n${obs.message.body}`,
      });
    }

    case "AWAITING_APPROVAL":
      return obs.approved
        ? advance("SENT", "a human approved it")
        : wait(policy.approvalBackoffMs, "nobody has approved it yet");

    case "SENT":
      return settled("the reply went out");
    case "DECLINED":
      return settled("nothing was sent, and the operator was told why");
  }
}
```

**No `await`. No `fs`. No `fetch`. No `new Date()`.** If you want one of those,
what you want is in the runtime.

Three habits worth copying from the shipped workflows:

- **Every `why` is a sentence a person will read in the log.** `"the ticket is
  unambiguous"`, not `"triage ok"`.
- **A ceiling is checked before the expensive thing**, not after it.
- **"The answer is no" is a terminal state, not a failure.** `DECLINED` exists so
  that giving up looks different from landing.

## 6. The runtime — the half that touches the world

```ts
// src/runtime.ts
import type { ActionHandler, Plan, WorkflowRuntime } from "@amy/core";

export function reviewRuntime(deps: Deps): WorkflowRuntime<ReviewRecord, Observation> {
  return {
    policy: deps.policy,

    found: async () => (await deps.inbox.unanswered()).map((m) => m.id),

    newRecord,

    observe: async (record) => ({
      message: await deps.inbox.get(record.id),
      approved: await deps.inbox.isApproved(record.id),
      inFlight: (await deps.inbox.awaitingApproval()).length,
    }),

    handlers: () => ({
      "draft-plan": (async (action, { outcomes }) => {
        const reply = await deps.agent.ask(action.prompt as string, deps.workspace);
        outcomes.draft = reply.text;
      }) as ActionHandler<ReviewRecord, Observation>,

      "announce": (async (action, { record }) => {
        await deps.notifier.announce({
          text: action.text as string,
          workId: record.id,
          state: record.state,
        });
      }) as ActionHandler<ReviewRecord, Observation>,
    }),

    apply: (record, plan, outcomes, observation, now) => {
      const next = { ...record, customer: observation.message.customer };

      if (typeof outcomes.draft === "string") {
        next.draft = outcomes.draft;
        next.lastAttempt = { ok: true, output: outcomes.draft, at: now.toISOString() };
      }

      return next;
    },
  };
}
```

Three things about `apply` that catch everybody:

**Do not fold the state, the attempt count or the history.** The engine already
did that through `applyPlan`. Doing it again is the defect the third workflow
found: every retry counted as two, and `maxAttempts` fired at half its
configured value.

**The observation is passed in for a reason.** Not everything a record learns
comes from an action. `approved` arrives as an observation, and a fold that
could not see one would leave the record waiting on it forever.

**`outcomes` is a bag you own at both ends.** Your handlers fill it and your
`apply` reads it. The engine only carries it between the two.

## 7. Wire it up as a plugin

```ts
// src/plugin.ts
import { WORKFLOW_RUNTIME, type Plugin, type PluginContext, type WorkflowRuntime } from "@amy/core";

export const configSchema: ConfigSchema = {
  policy: {
    type: "record",
    description: "maxAttempts, maxInFlight and approvalBackoffMs. Anything left out keeps its default",
    default: {},
  },
};

const runtimes = new WeakMap<PluginContext, WorkflowRuntime<ReviewRecord, Observation>>();

export const plugin: Plugin = {
  name: "@acme/workflow-review",
  version: "1.0.0",
  configSchema,
  register(registry, ctx) {
    registry.workflow(review);

    // Lazily, because the ports it needs are mounted by plugins that may be
    // listed after this one, and mounting order should not be something an
    // operator has to get right.
    const lazily = () => runtimeFor(ctx);

    registry.contribute(WORKFLOW_RUNTIME, review.name, {
      get policy() { return lazily().policy; },
      found: () => lazily().found(),
      newRecord: (id, now) => lazily().newRecord(id, now),
      observe: (record) => lazily().observe(record),
      handlers: () => lazily().handlers(),
      apply: (record, plan, outcomes, observation, now) =>
        lazily().apply(record, plan, outcomes, observation, now),
    } satisfies WorkflowRuntime<ReviewRecord, Observation>);
  },

  // Build it while boot can still refuse.
  ready(ctx) { runtimeFor(ctx); },
};

function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) throw new Error(`the review workflow needs the \`${kind}\` port, and nothing mounted it`);
  return port as T;
}
```

Two things there are load-bearing:

**The runtime is built lazily and keyed by context.** The exported plugin is a
module singleton; a field on it would be shared by every host in the process.

**`ready` builds it anyway**, so a port your workflow needs and nobody mounted is
a refusal at boot rather than a crash on the first tick.

## 8. The walkthrough test — the only real proof

Every workflow gets one. It is the test that finds the bugs, and it only exists
because `plan()` is pure.

```ts
it("walks a message from received to sent", () => {
  let record = newRecord("MSG-1", at(0));
  const seen: string[] = [record.state];

  for (let look = 0; look < 20; look += 1) {
    const decision = plan(record, world(record), DEFAULT_POLICY);
    if (decision.kind === "settled") break;

    record = applyPlan(record, decision, at(look));
    record = fold(record, decision);            // what the runtime would have folded
    if (record.state !== seen.at(-1)) seen.push(record.state);
  }

  expect(seen).toEqual(["RECEIVED", "DRAFTING", "AWAITING_APPROVAL", "SENT"]);
});
```

Assert three things, not one:

1. **The states, in order.** The lifecycle is what you meant.
2. **One look makes at most one move.** A look that advances twice is a bug that
   hides every intermediate state from the log.
3. **It settles rather than spinning.** Bound the loop and fail if it runs out.
   An unbounded lifecycle is a machine that never stops costing money.

Then one test per branch that is not the happy path: the ceiling, every retry
exhaustion, and every path to a `DECLINED`-shaped state. Those are where the
bugs live, and every one of them runs in microseconds with no I/O.

## 9. Drive it

```yaml
# ~/.amy/config.yaml
workflows:
  review:
    workflow: "@acme/workflow-review"
    plugins:
      - "@acme/workflow-review"
      - "@amy/plugin-file-queue"
      - "@amy/plugin-file-store"
      - "@amy/plugin-serial-engine"
      - "@amy/plugin-agent-relay"
      - "@amy/plugin-claude"
      - "@amy/plugin-notify-fanout"
      - "@amy/plugin-notify-inbox"
```

```sh
npm install -g .
amy --workflow review discover
amy --workflow review tick
amy --workflow review status
```

It runs on the same engine, against the same budget, in the same log, with the
same handbrake as everything else. Its records and queue live under
`~/.amy/review/`, so it never touches another profile's state.

## The mistakes worth naming

| Mistake | What it costs |
| :-- | :-- |
| `await` inside `plan()` | The walkthrough test needs I/O, so nobody writes it, so the lifecycle is never proven |
| Folding state or attempts in `apply` | Every retry counts twice; ceilings fire at half their value |
| No waiting state | A busy loop that burns quota politely |
| No terminal "no" state | Giving up looks exactly like landing |
| A ceiling checked after the agent call | A report, not a brake |
| Defining an action instead of composing one | Your workflow drags a domain nobody else can reuse |
| A `why` written for a machine | A log nobody can read at 3am |

## Worth reading next

- [Workflows](../concepts/workflows.md) — the contract, in detail.
- [Actions](../concepts/actions.md) — what to compose before inventing.
- [Testing](testing.md) — the walkthrough test, and proving the artifact.
- [Publishing](publishing.md) — getting it into the catalogue.
