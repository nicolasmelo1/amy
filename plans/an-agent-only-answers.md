# An agent only answers

amy is a workflow builder. The core is meant to hold contracts any workflow
can use, and one opinion on purpose: a project is `brief/`, `workflow/` and
`test/`. Reading the core against that showed one workflow's lifecycle living
in the contracts every workflow gets, in three places:

- **The `Agent` port is ticket-to-qa's.** It declares `triage`, `implement`
  and `addressThreads`, each taking a `Ticket`
  (`packages/core/src/ports/Ticketing.ts`). The generic half, `ask`, is not on
  the interface at all: `agent-relay` bolts it onto the port object beside the
  three (`plugins/agent-relay/src/plugin.ts:99`).
- **The agent pushes.** `HarnessAgent.implement` and `addressThreads` call
  `prepareBranch` and `commitAndPush` themselves
  (`packages/agent-kit/src/HarnessAgent.ts:117,152,190,216`). When a branch is
  pushed is a workflow's decision. A workflow that pushes once per cycle (a
  private one does, so nothing it writes is seen half-done) has to replace the
  checkout to get it back.
- **`Ticket` carries Linear's shape and leaks into ports that are not the
  tracker.** `branchName` and `team` are required although only Linear
  derives a branch name. `Gate.run` takes a whole `Ticket` to find a
  directory. `pullRequestTitle` fixes ticket-to-qa's title convention in the
  core.

`errand` already shows the alternative: it rebuilds "implement" from `ask`,
`prepareBranch` and `commitAndPush` in about thirty lines
(`packages/workflow-errand/src/runtime.ts:108`), and `HarnessRelay` already
relays `ask` over the same skill and harness ladders `AgentRelay` does, with
nobody's prompts in it (`packages/agent-kit/src/HarnessRelay.ts`).

## The decision

**The agent port is `ask`.** A prompt, a directory and a context go in. An
answer and an account of what it cost come back. Everything a step adds
around that call belongs to the workflow, or to `agent-kit` as a helper a
workflow chooses to call:

- `agent-kit` exports `implementStep`: ask, then call the commit the caller
  passed in, then classify the progress (a run that changed no file is
  `unchanged`). It never names git. Whoever calls it decides whether that
  commit pushes.
- `agent-kit` exports `judgeStep`: ask, then parse the JSON answer the caller
  describes. Triage and review verdicts are two uses of it.
- The ticket prompts, `TriageOutcome`, `ThreadVerdict` and the review hints
  move to `workflow-ticket-to-qa`, which exports them for a workflow that
  wants the same steps.
- The catalogue keeps `triage`, `implement` and `address-threads` as names.
  Each dispatches to `agent.ask`, so the budget, the ladders and the skills
  keep keying on them unchanged.

**`Ticket` requires only what every tracker has**: `id`, `title`, `url`,
`status`, `labels` and `repo`. `branchName` and `team` become optional, and a
workflow that needs a tracker-derived branch refuses a ticket without one by
name. `Gate.run` takes the workplace, `{ repo, workId }`. `pullRequestTitle`
moves to ticket-to-qa.

**What stays.** The action catalogue stays in the core: it is the list a
workflow author arranges, and it is what the boot reads to refuse an
undeclared write or to count an agent's spend. `CodeHost` stays shaped like a
GitHub pull request, because GitHub is the forge for the foreseeable future.

**Configuration does not move.** `agent.reviewerHints` stays where the user
wrote it in `config.yaml`. It reaches ticket-to-qa instead of every harness
plugin.

## The gates come first

Each decision is a local rule in `.software-factory/rules/`, with a mutation
fixture that proves it fires. They land before the implementation, with
today's violations frozen in the ratchet. Each implementation commit removes
its own entries, and the change is finished when none are left. Every rule's
`fix` names this document, so whoever trips one is told why the rule exists
before deciding what to do about it.

| Rule | What it refuses |
| --- | --- |
| `L0.THE_AGENT_PORT_ONLY_ASKS` | any member of the core's `Agent` other than `ask` |
| `L0.AGENT_ACTIONS_DISPATCH_TO_ASK` | a catalogue entry on the `agent` port whose method is not `ask` |
| `L0.AN_AGENT_NEVER_TOUCHES_GIT` | `prepareBranch`, `commitAndPush` or a `git push` in `agent-kit`, `agent-relay` or a harness plugin |
| `L0.PORTS_LIVE_IN_THEIR_OWN_FILE` | `Agent` or `Gate` declared anywhere but `ports/Agent.ts` and `ports/Gate.ts` |
| `L0.ONLY_THE_TRACKER_SPEAKS_TICKET` | the `Ticket` type named in the core outside `ports/Ticketing.ts` and the index |
| `L0.A_TICKET_REQUIRES_WHAT_EVERY_TRACKER_HAS` | a required `Ticket` field beyond `id`, `title`, `url`, `status`, `labels`, `repo` |
| `L0.THE_CORE_WORDS_NOTHING` | `pullRequestTitle` in the core |
| `L0.THE_CORE_NAMES_NO_VENDOR` | a product name (Linear, GitHub, Slack, Copilot, Claude, …) in core code, outside comments |

The rule and policy files are hash-locked. Loosening a rule takes an `sf lock`
in the same commit, which is a line in the diff a reviewer sees.

## Breaking changes

Breaking for implementers of `Agent`, `Gate` and `Ticket`, and for a workflow
that calls `agent.triage`, `agent.implement` or `agent.addressThreads`. This
ships in the same release as *the workflow contract changes once*, so a
workflow outside this repository migrates once. The changeset names each
member and where it went.

## Acceptance criteria

- [ ] The core's `Agent` declares `ask` and nothing else, and every catalogue action on the agent port dispatches to it (proof: test:packages/core/tests/architecture.test.ts)
- [ ] `Gate.run` takes a workplace rather than a ticket, and `Ticket` requires only `id`, `title`, `url`, `status`, `labels` and `repo` (proof: test:packages/core/tests/architecture.test.ts)
- [ ] The core exports no `pullRequestTitle` and names no vendor in code (proof: test:packages/core/tests/architecture.test.ts)
- [ ] `implementStep` commits only through the commit its caller passed, and reports a run that changed nothing as `unchanged` (proof: test:packages/agent-kit/tests/steps.test.ts)
- [ ] `judgeStep` parses the answer the caller describes, and a run that did not complete yields the caller's fallback with the run's account (proof: test:packages/agent-kit/tests/steps.test.ts)
- [ ] ticket-to-qa walks its whole lifecycle on the generic agent, with triage, implement and review verdicts unchanged (proof: test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)
- [ ] The agent port `agent-relay` mounts is `ask` over the skill and harness ladders, and a skill named for `implement` still answers that step (proof: test:plugins/agent-relay/tests/plugin.test.ts)
- [ ] `agent.reviewerHints` in `config.yaml` reaches ticket-to-qa's review prompt and no harness plugin (proof: test:packages/cli/tests/slices.test.ts)
- [ ] A ticket without a tracker-derived branch is refused by ticket-to-qa naming the field, before any branch is prepared (proof: test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)

**Exit condition:** the ratchet holds no entry for any of the eight rules
above, `sf verify` shows each of them firing on its fixture, and ticket-to-qa's
walkthrough passes on an `Agent` that has only `ask`.
