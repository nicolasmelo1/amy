---
base: a169c2390d991d86967ecf78d681c184ebc3565c
sources:
  - { id: S1, kind: code, ref: "package.json", symbol: "knip", said: "the gate runs knip in its default mode, which counts tests as callers, so an export only a test reaches passes; it exits 0 today" }
  - { id: S2, kind: reference, said: "measured 2026-11-15 at f804048e: knip --production reports 23 unused exports, 3 unused exported types, 2 unused dependencies and 76 files, most of them test helpers it was not told are entries" }
  - { id: S3, kind: code, ref: "plugins/file-worktree/src/manager.ts", symbol: "refusalFor", said: "a private field nothing reads; tsc with noUnusedLocals reports it, and it is the only one under src" }
  - { id: S4, kind: code, ref: "tsconfig.base.json", said: "noUnusedLocals and noUnusedParameters are not set" }
  - { id: S5, kind: friction, said: "2026-11-15 audit: the same helper written many times, isRecord 10, expandHome 7, the atomic JSON write about 10, Slack and Telegram's HTTP transport, which has already drifted: Slack's has no timeout" }
  - { id: S6, kind: code, ref: ".software-factory/policy.yaml", symbol: "L6.DEAD_CODE_IS_DETECTED", said: "the catalog rule only asks that a detector runs; nothing in the catalog detects duplicated code" }
  - { id: S7, kind: reference, ref: "https://github.com/kucherenko/jscpd", said: "jscpd finds copied blocks across TypeScript files by token count, reports them as JSON and exits non-zero over a threshold" }
  - { id: S8, kind: decision, said: "duplication and dead code fail the gate; what exists today is frozen in a ratchet with a due date, never allowed by a threshold that hides new copies. Decided 2026-11-15" }
  - { id: S9, kind: decision, said: "jscpd joins devDependencies; adding the package is the user's call before the build starts. Proposed 2026-11-15" }
touches:
  - package.json
  - package-lock.json
  - tsconfig.base.json
  - knip.json
  - .jscpd.json
  - scripts/check-duplication.ts
  - scripts/duplication-baseline.json
  - packages/cli/src/duplication.ts
  - packages/cli/tests/duplication.test.ts
  - plugins/file-worktree/tests/manager.test.ts
  - plugins/file-worktree/src/manager.ts
  - packages/cli/tests/project.test.ts
  - plugins/concurrent-engine/tests/lanes.test.ts
  - plugins/hermes-agent/tests/setup.test.ts
  - .allowed-root-files
  - packages/core/src/calls.ts
  - packages/core/src/diagram.ts
  - packages/workflow-setup/src/machine.ts
  - plugins/claude/src/usage.ts
  - packages/cli/src/assemble.ts
  - packages/cli/src/config.ts
  - packages/cli/src/index.ts
  - packages/cli/src/update.ts
  - registry/cli.json
  - registry/core.json
  - registry/plugin-claude.json
  - registry/plugin-file-worktree.json
  - registry/workflow-setup.json
  - docs/development/the-gate.md
  - docs/rules.md
  - docs/development/the-factory.md
  - CONTRIBUTING.md
criteria:
  - { id: A1, statement: "noUnusedLocals and noUnusedParameters are on, and refusalFor is gone; a private member nothing reads fails typecheck", proof: "deferred:test:plugins/file-worktree/tests/manager.test.ts", sources: [S3, S4] }
  - { id: A2, statement: "the gate runs knip --production with test helpers declared as entries, and fails on an export, type, file or dependency only a test reaches", proof: "deferred:test:packages/cli/tests/duplication.test.ts", sources: [S1, S2, S6] }
  - { id: A3, statement: "what knip --production reports at the base is deleted or frozen by name in the ratchet with a review_by, and the pull request says how many of each", proof: "deferred:open — counted when the build starts", sources: [S2, S8] }
  - { id: A4, statement: "the gate runs jscpd over packages, plugins and examples src; a copied block that is not in the baseline fails, naming both places", proof: "deferred:test:packages/cli/tests/duplication.test.ts", sources: [S5, S7, S9] }
  - { id: A5, statement: "the baseline only shrinks: a pair it lists that is gone is dropped by the check, and a pair added to it by hand fails review as a ratchet key", proof: "deferred:test:packages/cli/tests/duplication.test.ts", sources: [S8] }
  - { id: A6, statement: "duplicated-code-is-detected is an L6 toolchain rule asserting the gate still runs both detectors, with a mutation fixture that drops one", proof: "deferred:test:packages/cli/tests/duplication.test.ts", sources: [S6, S8] }
crosses:
  - { mechanism: config, answer: n/a, why: "mountingFrom loses an unused parameter; no schema, template or environment name changes" }
  - { mechanism: calls, answer: n/a, why: "folded loses the call site it never read; how a workflow calls another is unchanged" }
  - { mechanism: diagram, answer: n/a, why: "readClass loses a count it never read; workflow.mmd is read and refused as before" }
  - { mechanism: mount-and-capabilities, answer: n/a, why: "assemble loses a config it never read; what boot binds and what a workflow reaches are unchanged" }
  - { mechanism: agent-replies, answer: n/a, why: "the claude reader loses an unread timeout field it already copies into the timer; replies are parsed and classified as before" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "only an unread private field is deleted from the worktree manager; no checkout or lease changes" }
  - { mechanism: install-and-update, answer: n/a, why: "a devDependency and gate scripts; nothing an install or update of amy ships changes" }
guarantee:
  - { holds: "a new copy of a block, or code only a test reaches, does not merge green", not_against: "a copy below jscpd's token floor, or the same idea written twice in different words" }
failures:
  - { step: gate, when: "jscpd is not installed", goes_to: "the toolchain rule red naming the missing detector, not a silent pass" }
cut:
  - "folding today's copies into core helpers: each is its own change, the ratchet holds them until then"
exit: "npm run gate fails on a copied block and on an export only a test reaches, and is green at the base with every existing one frozen by name"
---
# Code is written once and reached

The gate runs knip in a mode where a test counts as a caller. Nothing looks
for copies, and the audit found helpers written up to ten times, already
drifting apart. Both become gate failures. What exists today is frozen by
name and comes due.
