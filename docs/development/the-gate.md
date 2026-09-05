---
title: The gate
description: One command, thirty-three rules proven to fire, and seven gates whose proofs expire.
group: Development
order: 2
---

# The gate

```sh
npm run gate
```

That is the whole definition, in one place: build, typecheck, release config,
tests with a coverage floor, lint, a dead-code detector, a dependency audit, the
documentation drift check, `sf check` and `sf verify`. **If it is not in there
it is not gated.**

## The rules, and the thing that makes them worth having

This repository runs [software factory](https://github.com/nicolasmelo1/software-factory)
on itself, and `sf verify` proves **every enabled rule fires** against a
deliberately broken fixture.

That second part is the point. A rule that cannot fail is a rule that is lying,
and a repository full of them looks exactly like one that is well guarded. So
the tool that refuses to open a pull request until a gate is green is itself
held to a gate that is proven to work.

<!-- amy:generated factory-rules -->

| Rule | What it holds |
| :-- | :-- |
| `L0.CORE_STAYS_IGNORANT` | The core imports no workflow and no plugin |
| `L0.EXCEPTIONS_HAVE_ONE_HOME` | Error types live in one canonical module per domain |
| `L0.NO_CROSS_LAYER_IMPORT` | Private and generated modules are not imported across the boundary |
| `L1.COMMENT_STAYS_SUCCINCT` | A comment block stays under the line ceiling |
| `L1.COMPLEXITY_CEILING` | No function exceeds the cyclomatic ceiling |
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
| `L3.GATE_COVERS_THE_PLAN` | A gate requires every check its plan's criteria name |
| `L3.GATE_HAS_FRESH_EVIDENCE` | A gate activated by touched paths needs digest-verified, non-stale evidence |
| `L4.CLAIM_CITES_ITS_EVIDENCE` | Every marked promise names the gate that proves it |
| `L4.DOC_LINKS_RESOLVE` | Repo-relative documentation links resolve |
| `L4.EVERY_RULE_HAS_A_WHY` | Every enabled rule is cited in prose, and every citation resolves |
| `L4.PLAN_CRITERION_NAMES_ITS_CHECK` | Every acceptance criterion names the check that proves it |
| `L4.PLAN_DECLARES_EXIT_CONDITION` | Every plan declares its exit condition and sits in the execution order |
| `L4.ROOT_FILES_ARE_DECLARED` | New top-level files are declared before they appear |
| `L4.RULE_PROSE_NAMES_A_REAL_COMMAND` | Every command a rule's prose quotes is one this `sf` accepts |
| `L5.EVERY_CHECK_HAS_A_MUTATION_TEST` | Every enabled rule has a mutation that proves it fires |
| `L5.NO_INERT_RULE` | An enabled rule must be capable of producing a finding |
| `L6.DEAD_CODE_IS_DETECTED` | Something detects code nothing reaches |
| `L6.DEPENDENCY_VULNERABILITIES_ARE_SCANNED` | Something audits dependencies for known vulnerabilities |
| `L6.FIXTURES_NAME_NOBODY_REAL` | An address in a fixture belongs to nobody |
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

Two of the security linter's rules are off as well, in writing:
`detect-non-literal-fs-filename` and `detect-object-injection`. This program is
a file-backed queue, store and log whose every path is computed, and every
object index is keyed by a union the compiler already checks. Left on they
produced 105 warnings and buried the one real finding, which was a regular
expression that could be made to backtrack forever.

### The one worth naming

`L0.CORE_STAYS_IGNORANT`: **nothing under `packages/core/src` may import an
`@amykit/workflow-*` or `@amykit/plugin-*` package.** The whole plugin model rests on
it, and until it was a check it rested on nobody making a single wrong import.
Its mutation fixture is a core file importing a workflow's type, and `sf verify`
confirms the rule still catches it.

## The hazards nobody notices until the day they matter

Six rules are the L6 layer, and none of them audits anything itself — the
ecosystem tools are better than anything a rule could do. What each one checks is
that **the tool is still wired in**, because a scanner somebody removed to make
CI faster fails exactly like one that was never added.

| Hazard | Tool | Where it runs |
| :-- | :-- | :-- |
| Dependency vulnerabilities | `npm audit` | the gate, and CI |
| Committed secrets | `gitleaks` | CI, on what a pull request adds |
| Insecure patterns | `eslint-plugin-security` | the gate, and CI |
| Dead code | `knip` | the gate, and CI |
| Insecure workflows | `zizmor` | CI |
| Performance regression | `vitest bench` | CI, against a committed baseline |

## The gates, and the thing that will surprise you

> The tests exercise classes. The gates exercise the artifact.

Every unit test imports a source file from inside the workspace. A barrel that
forgets an export, or a `dist` nobody built, passes the whole suite and is broken
on the machine that installs it.

So each gate is a scenario that imports `dist/index.js` **from another process**,
asserts what the thing promises, and writes a report sealed with a digest.

<!-- amy:generated factory-gates -->

| Gate | What expires it | Assertions |
| :-- | :-- | :-- |
| `installed-binary` | `packages/cli/src/stamp.ts`<br>`packages/cli/src/home.ts`<br>`packages/core/src/build.ts`<br>`scripts/**` | 7 |
| `installed-plugins` | `packages/cli/src/loader.ts`<br>`packages/cli/src/profiles.ts`<br>`packages/cli/src/paths.ts`<br>`packages/cli/src/slices.ts`<br>`scripts/install.sh`<br>`scripts/write-install-manifest.mjs` | 12 |
| `note-to-plan` | `packages/workflow-note-to-plan/src/**`<br>`packages/agent-kit/src/**`<br>`packages/cli/src/**`<br>`plugins/file-notes/src/**`<br>`plugins/plan-check/src/**`<br>`plugins/agent-relay/src/**`<br>`plugins/serial-engine/src/**`<br>`plugins/github/src/**` | 19 |
| `plugin-agent-relay` | `plugins/agent-relay/src/**`<br>`packages/agent-kit/src/**` | 16 |
| `plugin-file-queue` | `plugins/file-queue/src/**` | 6 |
| `plugin-serial-engine` | `plugins/serial-engine/src/**`<br>`plugins/notify-fanout/src/**` | 11 |
| `ticket-to-qa` | `packages/workflow-ticket-to-qa/src/**`<br>`packages/agent-kit/src/**`<br>`packages/cli/src/**`<br>`plugins/serial-engine/src/**`<br>`plugins/linear/src/**`<br>`plugins/github/src/**`<br>`plugins/claude/src/**`<br>`plugins/command-gate/src/**`<br>`plugins/notify-fanout/src/**`<br>`plugins/notify-inbox/src/**` | 24 |

<!-- amy:end factory-gates -->

Each one exists for a reason worth stating:

- **`plugin-file-queue`** — because the engine cannot survive it handing one item out twice.
- **`plugin-agent-relay`** — because it decides how money gets spent when something goes wrong.
- **`plugin-serial-engine`** — because it decides whether a piece of work gets lost.
- **`installed-binary`** — because every test in the suite imports from inside the workspace.
- **`installed-plugins`** — because a plugin model nobody outside this repository can use is not one.
- **`ticket-to-qa` and `note-to-plan`** — because none of the others answers the question somebody actually has.

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

Coverage thresholds sit just under what the suite achieves, so coverage can only
be ratcheted up. Two complexity findings are frozen in
`.software-factory/ratchet.yaml` with a note saying why, and
`L2.NO_PERMANENT_EXCEPTION` makes sure each carries a review date — a permanent
exception is a rule somebody turned off and called a decision.
