---
title: The gate
description: One command, the rules proven to fire, and the gates whose proofs expire.
group: Development
order: 2
---

# The gate

```sh
npm run gate
```

That is the whole definition, in one place in `package.json`: the build, the
typecheck, the repository's own checks (release config, config template, plans,
delivered plans, private references, toolchain, vendored contracts, registry
items), the documentation check, the tests with a coverage floor, lint, a
dead-code detector, a dependency audit, `sf check` and `sf verify`. **If it is
not in there it is not gated.** CI runs the same steps; the scenarios run
separately, with `npm run e2e`.

## The rules, and the thing that makes them worth having

This repository runs [software factory](https://github.com/nicolasmelo1/software-factory)
on itself, and `sf verify` proves **every enabled rule fires** against a
deliberately broken fixture.

That proof is what matters. A rule that cannot fail is a rule that is lying,
and a repository full of them looks exactly like one that is well guarded. So
the tool that refuses to open a pull request until a gate is green is itself
held to a gate that is proven to work.

<!-- amy:generated factory-rules -->

| Rule | What it holds |
| :-- | :-- |
| `L0.A_RENDERER_NAMES_NO_COLOUR` | A renderer spells no colour outside its theme-token file (docs/design/the-frame-is-closed.md) |
| `L0.A_RENDERER_ONLY_TRANSLATES` | A renderer imports the primitives and the frame, and nothing else of amy (docs/design/the-frame-is-closed.md) |
| `L0.A_TICKET_REQUIRES_WHAT_EVERY_TRACKER_HAS` | A ticket requires only what every tracker has (docs/design/an-agent-only-answers.md) |
| `L0.A_VIEW_DRAWS_NOTHING` | A view draws nothing; only a renderer plugin names a renderer (docs/design/a-view-is-data.md) |
| `L0.AGENT_ACTIONS_DISPATCH_TO_ASK` | Every catalogue action on the agent port dispatches to ask (docs/design/an-agent-only-answers.md) |
| `L0.AN_AGENT_NEVER_TOUCHES_GIT` | An agent never prepares a branch, commits or pushes (docs/design/an-agent-only-answers.md) |
| `L0.CORE_STAYS_IGNORANT` | The core imports no workflow and no plugin |
| `L0.EXCEPTIONS_HAVE_ONE_HOME` | Error types live in one canonical module per domain |
| `L0.NO_CROSS_LAYER_IMPORT` | Private and generated modules are not imported across the boundary |
| `L0.ONLY_THE_TRACKER_SPEAKS_TICKET` | Only the tracker's contract names a ticket (docs/design/an-agent-only-answers.md) |
| `L0.PORTS_LIVE_IN_THEIR_OWN_FILE` | The agent and gate ports live in their own files (docs/design/an-agent-only-answers.md) |
| `L0.THE_AGENT_PORT_ONLY_ASKS` | The core's agent port declares ask and nothing else (docs/design/an-agent-only-answers.md) |
| `L0.THE_CORE_NAMES_NO_VENDOR` | The core's code names no product (docs/design/an-agent-only-answers.md) |
| `L0.THE_CORE_WORDS_NOTHING` | The core writes no title for anybody (docs/design/an-agent-only-answers.md) |
| `L0.THE_HOST_NAMES_NO_ROSTER` | carried ceiling (`rosterBackoffMs`) is the config plan's to remove |
| `L0.THE_SERVICES_KEEP_NO_DATABASE` | The ports are the truth: no driver, no filesystem outside a repository, every port call awaited (docs/design/amy-speaks-in-domains.md) |
| `L0.THE_SERVICES_KEEP_THEIR_DOMAINS` | Each domain keeps its layout, and only a repository reaches a port (docs/design/amy-speaks-in-domains.md) |
| `L1.COMMENT_STAYS_SUCCINCT` | A comment block stays under the line ceiling |
| `L1.COMPLEXITY_CEILING` | No function exceeds the cyclomatic ceiling |
| `L1.EVERY_RENDERER_HOLDS_THE_FRAME` | Every renderer in the workspace passes the frame's conformance script (docs/design/the-frame-is-closed.md) |
| `L1.NO_BLANKET_SUPPRESSION` | Every suppression names a code and a reason |
| `L1.NO_UNTYPED_ESCAPE_HATCH` | The untyped escape hatch is banned, and the message names the alternative |
| `L1.SKIPPED_TESTS_STATE_A_REASON` | A skipped or expected-to-fail test says why |
| `L2.CATALOG_ONLY_TIGHTENS` | A released rule never gets weaker than the version this repository locked |
| `L2.DEPENDENCIES_CHANGE_DELIBERATELY` | Dependency manifests move only with an explicit lock update |
| `L2.DERIVED_ARTIFACTS_MATCH_THEIR_SOURCE` | Regenerating the derived artifacts changes nothing |
| `L2.FACTORY_CONFIG_IS_LOCKED` | The guardrail's own configuration is hash-locked |
| `L2.GENERATED_FILES_ARE_LOCKED` | Generated artifacts are hash-locked and not hand-edited |
| `L2.NO_PERMANENT_EXCEPTION` | Every frozen exception carries a future review date |
| `L2.POLICY_ONLY_TIGHTENS` | The guardrail may be strengthened, never quietly weakened |
| `L2.THE_CONTRACT_ONLY_BREAKS_ON_PURPOSE` | The contract breaks only when its major is raised (docs/design/amy-speaks-in-domains.md) |
| `L3.EVERY_DECLARED_ERROR_IS_TESTED` | Every declared error is an outcome some test produced (docs/design/amy-speaks-in-domains.md) |
| `L3.GATE_COVERS_THE_PLAN` | A gate requires every check its plan's criteria name |
| `L3.GATE_HAS_FRESH_EVIDENCE` | A gate activated by touched paths needs digest-verified, non-stale evidence |
| `L4.A_DELIVERED_PLAN_KEEPS_NO_PROMISE` | A delivered plan keeps no promise it did not prove |
| `L4.CLAIM_CITES_ITS_EVIDENCE` | Every marked promise names the gate that proves it |
| `L4.DOC_LINKS_RESOLVE` | Repo-relative documentation links resolve |
| `L4.EVERY_RULE_HAS_A_WHY` | Every enabled rule is cited in prose, and every citation resolves |
| `L4.PLAN_CRITERION_NAMES_ITS_CHECK` | Every acceptance criterion names the check that proves it |
| `L4.PLAN_DECLARES_EXIT_CONDITION` | Every plan declares its exit condition and sits in the execution order |
| `L4.PLAN_IS_A_LINKED_DECLARATION` | A plan is a declaration where every line is tied to another |
| `L4.ROOT_FILES_ARE_DECLARED` | New top-level files are declared before they appear |
| `L4.RULE_PROSE_NAMES_A_REAL_COMMAND` | Every command a rule's prose quotes is one this `sf` accepts |
| `L4.THE_CONTRACT_DOCUMENTS_ITSELF` | Every operation, property, example and error in the contract is documented (docs/design/amy-speaks-in-domains.md) |
| `L5.A_FIXTURE_READS_THE_CORE_VERSION` | An evidence fixture reads the core's version, never writes one |
| `L5.EVERY_CHECK_HAS_A_MUTATION_TEST` | Every enabled rule has a mutation that proves it fires |
| `L5.EVERY_PROPERTY_HAS_A_FALSIFIER` | Every property a plan cites is proven able to fail |
| `L5.NO_INERT_RULE` | An enabled rule must be capable of producing a finding |
| `L6.A_PUSH_NEVER_FORCES` | A push is a fast-forward or nothing (docs/design/a-private-workflow-composes-the-shipped-one.md) |
| `L6.BRANCH_RESET_LOSES_COMMITS` | scaffolded workflow ships with, here because the core drives git too. |
| `L6.DEAD_CODE_IS_DETECTED` | Something detects code nothing reaches |
| `L6.DEPENDENCY_VULNERABILITIES_ARE_SCANNED` | Something audits dependencies for known vulnerabilities |
| `L6.FIXTURES_NAME_NOBODY_REAL` |  |
| `L6.INSECURE_PATTERNS_ARE_SCANNED` | Something scans the code for known-insecure patterns |
| `L6.PERFORMANCE_REGRESSION_IS_GUARDED` | Something would notice the code getting slower |
| `L6.SECRETS_ARE_SCANNED` | Something scans for committed secrets |
| `L6.WORKFLOWS_ARE_SCANNED` | Something scans the CI workflows themselves |

<!-- amy:end factory-rules -->

The reasoning behind each one is in
[`docs/rules.md`](https://github.com/nicolasmelo1/amy/blob/main/docs/rules.md),
which `sf` generates and `L4.EVERY_RULE_HAS_A_WHY` keeps in step with what is
enforced.

### Deliberately off

<!-- amy:generated factory-disabled -->

| Rule | Why it is off |
| :-- | :-- |
| `L6.DATA_RACES_ARE_DETECTED` | there is no dynamic race detector for this language, and the rule names none. One process, one event loop, and the one thing that is genuinely concurrent — two workers on one queue — is settled by an atomic rename rather than by a lock, and proven by the file-queue gate. |
| `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK` | the rule has no query for TypeScript, so enabling it here would be a rule that cannot fire. Nothing in this workspace takes a lock; the queue is a directory and claiming is a rename. |
| `L6.ONE_LOCK_AT_A_TIME` | same reason as the rule above. No TypeScript query, and no locks to hold. |

<!-- amy:end factory-disabled -->

Some of the security linter's rules are off as well, in writing, in
`eslint.config.ts`: `detect-non-literal-fs-filename` and
`detect-object-injection`. This program is a file-backed queue, store and log
whose every path is computed, and every object index is keyed by a union the
compiler already checks. Left on they produced a flood of warnings that
buried the one real finding, which was a regular expression that could be made
to backtrack forever.

### The one worth naming

`L0.CORE_STAYS_IGNORANT`: **nothing under `packages/core/src` may import an
`@amykit/workflow-*` or `@amykit/plugin-*` package.** The whole plugin model rests on
it, and until it was a check it rested on nobody making a single wrong import.
Its mutation fixture is a core file importing a workflow's type, and `sf verify`
confirms the rule still catches it.

## The hazards nobody notices until the day they matter

Some of the L6 rules audit nothing themselves, because the ecosystem tools are
better than anything a rule could do. What each of them checks is that **the
tool is still wired in**, because a scanner somebody removed to make CI faster
fails exactly like one that was never added.

| Hazard | Tool | Where it runs |
| :-- | :-- | :-- |
| Dependency vulnerabilities | `npm audit` | the gate, and CI |
| Committed secrets | `gitleaks` | CI, on what a pull request adds |
| Insecure patterns | `eslint-plugin-security` | the gate, and CI |
| Dead code | `knip` | the gate, and CI |
| Insecure workflows | `zizmor` | CI |
| Performance regression | `vitest bench` | CI, against a committed baseline |

## The gates, and the thing that will surprise you

Counted from the policy on every build:

<!-- amy:generated factory-counts -->

This repository runs [software factory](https://github.com/nicolasmelo1/software-factory) on itself: **57 rules**, and `sf verify` proves every one fires against a broken fixture.

**28 gates** each pin a claim to a scenario that drives the built artifact from another process, with the evidence sealed by digest. Touching covered code expires its proof, because the last run proved something that no longer exists.

<!-- amy:end factory-counts -->

> The tests exercise classes. The gates exercise the artifact.

Every unit test imports a source file from inside the workspace. A barrel that
forgets an export, or a `dist` nobody built, passes the whole suite and is broken
on the machine that installs it. Why the gates exist:
[every plugin is proven end to end](../design/every-plugin-is-proven-end-to-end.md),
and [what runs is not this repo](../design/what-runs-is-not-this-repo.md).

So each gate is a scenario that drives the built artifact **from another
process**, asserts what the thing promises, and writes a report sealed with a
digest. A gate's `plan` in the policy names the design note that argues for it.

<!-- amy:generated factory-gates -->

| Gate | What expires it | Assertions |
| :-- | :-- | :-- |
| `a-brief-is-groomed-through-amy` | `packages/core/src/define-workflow.ts`<br>`packages/cli/src/project.ts`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/doctor.ts`<br>`packages/cli/skills/amy-groom/**`<br>`plugins/file-brief-store/src/**` | 7 |
| `a-plugin-of-your-own` | `packages/cli/src/fork.ts`<br>`packages/cli/src/loader.ts`<br>`packages/cli/src/paths.ts`<br>`packages/cli/src/add.ts`<br>`packages/cli/src/remove.ts` | 4 |
| `a-private-workflow-composes` | `packages/core/src/git.ts`<br>`packages/core/src/mount.ts`<br>`packages/core/src/ports/CodeHost.ts`<br>`packages/core/src/ports/Conversation.ts`<br>`packages/core/src/ports/Notifier.ts`<br>`packages/core/src/ports/Queue.ts`<br>`packages/core/src/ports/Ticketing.ts`<br>`packages/core/src/operator.ts`<br>`packages/core/src/runtime.ts`<br>`examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd`<br>`plugins/linear/src/**`<br>`plugins/serial-engine/src/**`<br>`plugins/github/src/**`<br>`plugins/file-queue/src/**` | 53 |
| `a-question-is-not-an-answer` | `packages/core/src/ports/Conversation.ts`<br>`packages/core/src/actions.ts`<br>`examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd`<br>`plugins/slack/src/**`<br>`plugins/serial-engine/src/**` | 8 |
| `a-workflow-calls-another` | `packages/core/src/calls.ts`<br>`packages/core/src/expand.ts`<br>`packages/core/src/define-workflow.ts`<br>`packages/core/src/diagram.ts`<br>`examples/workflow-pull-request/src/**`<br>`examples/workflow-pull-request/workflow.mmd`<br>`packages/cli/src/workflow-add.ts`<br>`packages/cli/src/workflow.ts`<br>`packages/cli/src/status-page.tsx` | 7 |
| `a-workflow-of-your-own` | `packages/cli/src/workflow.ts`<br>`packages/cli/src/loader.ts`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/config.ts`<br>`packages/cli/skills/amy-workflow/SKILL.md`<br>`packages/cli/guardrails/**`<br>`docs/guides/write-a-workflow.md` | 11 |
| `a-workspace-is-a-capability` | `packages/core/src/checkouts.ts`<br>`packages/core/src/mount.ts`<br>`packages/core/src/plugin.ts`<br>`packages/core/src/ports/Workspace.ts`<br>`packages/core/src/define-workflow.ts`<br>`packages/cli/src/config.ts`<br>`packages/cli/src/slices.ts`<br>`packages/cli/src/doctor.ts`<br>`plugins/file-worktree/src/**`<br>`plugins/command-gate/src/**`<br>`.software-factory/evidence/a-workspace-is-a-capability/**`<br>`.software-factory/evidence/a-workspace-is-a-capability-scenario.sh` | 6 |
| `amy-add-remove` | `packages/cli/src/index.ts`<br>`packages/cli/src/spec.ts`<br>`packages/cli/src/add.ts`<br>`packages/cli/src/remove.ts`<br>`packages/cli/src/slices.ts`<br>`packages/cli/src/config.ts` | 6 |
| `amy-answers-in-the-chat` | `packages/core/src/chat/**`<br>`packages/core/src/ports/Conversation.ts`<br>`plugins/telegram/src/**`<br>`plugins/slack/src/**`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/assemble.ts`<br>`packages/cli/src/chat-action.ts`<br>`packages/cli/src/supervisor/**`<br>`.software-factory/evidence/amy-answers-in-the-chat/**`<br>`.software-factory/evidence/amy-answers-in-the-chat-scenario.sh` | 8 |
| `amy-update` | `packages/cli/src/plugin-commands.ts`<br>`packages/cli/src/update.ts`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/skills-record.ts`<br>`packages/cli/src/harnesses.ts`<br>`packages/cli/src/auto-update.ts`<br>`packages/cli/src/daemon.ts`<br>`packages/cli/src/config.ts`<br>`.changeset/config.json`<br>`scripts/install.sh`<br>`scripts/write-install-manifest.ts`<br>`.software-factory/evidence/amy-update/registry.ts`<br>`.software-factory/evidence/amy-update/release.ts` | 47 |
| `bare-install` | `packages/cli/package.json`<br>`packages/cli/src/profiles.ts`<br>`packages/cli/src/config.ts`<br>`packages/cli/src/doctor.ts` | 12 |
| `errand` | `examples/workflow-errand/src/**`<br>`examples/workflow-errand/workflow.mmd`<br>`plugins/file-tasks/src/**`<br>`packages/agent-kit/src/**`<br>`packages/cli/src/**`<br>`packages/core/src/git.ts`<br>`plugins/claude/src/**`<br>`plugins/file-worktree/src/**`<br>`plugins/github/src/**`<br>`plugins/notify-fanout/src/**`<br>`plugins/notify-inbox/src/**`<br>`plugins/serial-engine/src/**`<br>`examples/workflow-pull-request/src/**`<br>`examples/workflow-pull-request/workflow.mmd`<br>`packages/core/src/calls.ts` | 15 |
| `feature-grooming` | `examples/workflow-feature-grooming/src/**`<br>`examples/workflow-feature-grooming/workflow.mmd`<br>`packages/core/src/ports/BaseSource.ts`<br>`packages/core/src/ports/Ticketing.ts`<br>`plugins/linear/src/**`<br>`packages/cli/src/slices.ts`<br>`packages/cli/src/profiles.ts` | 7 |
| `harness-usage` | `packages/agent-kit/src/**`<br>`plugins/claude/src/**`<br>`plugins/codex/src/**`<br>`plugins/hermes-agent/src/**`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/status-page.tsx`<br>`packages/cli/src/budget.ts` | 5 |
| `installed-binary` | `packages/cli/src/stamp.ts`<br>`packages/cli/src/home.ts`<br>`packages/core/src/build.ts`<br>`scripts/**` | 7 |
| `installed-plugins` | `packages/cli/src/loader.ts`<br>`packages/cli/src/profiles.ts`<br>`packages/cli/src/paths.ts`<br>`packages/cli/src/slices.ts`<br>`scripts/install.sh`<br>`scripts/write-install-manifest.ts`<br>`packages/core/src/mount.ts`<br>`packages/core/src/dispatch.ts`<br>`plugins/serial-engine/src/Worker.ts` | 17 |
| `note-to-plan` | `examples/workflow-note-to-plan/src/**`<br>`examples/workflow-note-to-plan/workflow.mmd`<br>`packages/agent-kit/src/**`<br>`packages/cli/src/**`<br>`plugins/file-notes/src/**`<br>`plugins/plan-check/src/**`<br>`plugins/agent-relay/src/**`<br>`plugins/serial-engine/src/**`<br>`plugins/github/src/**`<br>`examples/workflow-pull-request/src/**`<br>`examples/workflow-pull-request/workflow.mmd`<br>`packages/core/src/calls.ts` | 22 |
| `plugin-agent-relay` | `plugins/agent-relay/src/**`<br>`packages/agent-kit/src/**` | 27 |
| `plugin-file-queue` | `plugins/file-queue/src/**` | 9 |
| `plugin-github` | `plugins/github/src/**`<br>`examples/workflow-*/src/**`<br>`packages/workflow-testkit/src/**` | 4 |
| `plugin-next-steps` | `plugins/next-steps/src/**`<br>`packages/core/src/ports/Ticketing.ts`<br>`packages/core/src/ports/BaseSource.ts`<br>`examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd` | 4 |
| `plugin-serial-engine` | `plugins/serial-engine/src/**`<br>`plugins/notify-fanout/src/**` | 13 |
| `plugin-telegram` | `plugins/telegram/src/**`<br>`plugins/telegram/tests/stand-in.ts`<br>`packages/core/src/ports/Conversation.ts`<br>`packages/test-fixtures/contracts/telegram-bot-api.json`<br>`packages/test-fixtures/src/contracts/telegram.ts`<br>`examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd` | 3 |
| `project-phases` | `packages/cli/src/assemble.ts`<br>`packages/cli/src/project.ts`<br>`packages/cli/src/index.ts`<br>`packages/cli/src/paths.ts`<br>`packages/cli/src/profiles.ts`<br>`packages/cli/src/slices.ts`<br>`packages/cli/src/loader.ts`<br>`packages/core/src/define-workflow.ts`<br>`packages/core/src/mount.ts`<br>`plugins/file-brief-store/src/**` | 9 |
| `the-event-log-can-be-watched` | `packages/core/src/ports/EventLog.ts`<br>`plugins/file-log/src/**` | 6 |
| `ticket-to-qa` | `examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd`<br>`packages/agent-kit/src/**`<br>`packages/cli/src/**`<br>`plugins/file-store/src/**`<br>`plugins/file-brief-store/src/**`<br>`plugins/file-worktree/src/**`<br>`plugins/serial-engine/src/**`<br>`plugins/linear/src/**`<br>`plugins/github/src/**`<br>`plugins/claude/src/**`<br>`plugins/command-gate/src/**`<br>`plugins/notify-fanout/src/**`<br>`plugins/notify-inbox/src/**`<br>`plugins/slack/src/**`<br>`packages/core/src/ports/Conversation.ts`<br>`packages/core/src/calls.ts`<br>`packages/core/src/leases.ts`<br>`plugins/concurrent-engine/src/**` | 56 |
| `ui-frame` | `packages/ui/**`<br>`packages/ui-conformance/src/**`<br>`plugins/ui-*/src/**` | 11 |
| `workflow-three-pieces` | `packages/core/src/define-workflow.ts`<br>`packages/core/src/action-ports.ts`<br>`packages/core/src/index.ts`<br>`packages/cli/src/workflow.ts`<br>`examples/workflow-errand/src/**`<br>`examples/workflow-errand/workflow.mmd`<br>`examples/workflow-note-to-plan/src/**`<br>`examples/workflow-note-to-plan/workflow.mmd`<br>`examples/workflow-ticket-to-qa/src/**`<br>`examples/workflow-ticket-to-qa/workflow.mmd` | 2 |

<!-- amy:end factory-gates -->

Some of them, and why each exists:

- **`plugin-file-queue`**: the engine cannot survive the queue handing one item out twice.
- **[`the-event-log-can-be-watched`](../design/the-event-log-can-be-watched.md)**: a window that misses a line, or reads half of one, shows a machine that is not the one running.
- **`plugin-agent-relay`**: it decides how money gets spent when something goes wrong ([the relay is proven end to end](../design/the-relay-is-proven-end-to-end.md)).
- **`plugin-serial-engine`**: it decides whether a piece of work gets lost.
- **`installed-binary`**: every test in the suite imports from inside the workspace.
- **`installed-plugins`**: a plugin model nobody outside this repository can use is not one.
- **`ticket-to-qa`, `note-to-plan` and `errand`**: none of the others answers whether a piece of work goes in one end and comes out the other ([the lifecycle is proven end to end](../design/the-lifecycle-is-proven-end-to-end.md), [the errand is proven end to end](../design/the-errand-is-proven-end-to-end.md)).

### A gate's proof expires

A gate lists **activation paths**. Touching one makes its evidence stale, and
`sf check` goes red until the scenario runs again:

```
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `plugin-file-queue` was proven
```

That is not a bug. The last run proved a queue that no longer exists.

```sh
npm run e2e                                            # run every scenario
./.software-factory/evidence/ticket-to-qa-scenario.sh  # or just one
sf seal ticket-to-qa                                   # record it
```

**Never hand-edit a digest.** If the scenario cannot pass, the finding is the
product's behaviour, not the gate's.

## Coverage and the ratchet

Coverage thresholds in `vitest.config.ts` sit just under what the suite
achieves, so coverage can only be ratcheted up. A rule violation that cannot be
fixed yet is frozen in `.software-factory/ratchet.yaml` with a note saying why,
and `L2.NO_PERMANENT_EXCEPTION` makes sure each carries a review date: a
permanent exception is a rule somebody turned off and called a decision.
