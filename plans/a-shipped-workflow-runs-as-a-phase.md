---
sources:
  - { id: S1, kind: friction, said: "2026-11-11: a private project walking BRIEF → WORK → PROVE on amy's pieces stops three times: a wrong ticket id, an agent that edits nothing, a proving phase that will not mount; each was forked" }
  - { id: S2, kind: code, ref: "packages/core/src/calls.ts", symbol: "newChild", said: "a called workflow's record id is `<caller id>/<STATE>#<n>`, e.g. `SHOP-1/WORK#1`, and nothing in the core says what unit it is for" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/src/actions.ts", symbol: "splitWorkId", said: "ticket-to-qa takes `work.record.id` as the ticket id (and `id@repo`); called as a phase it asks the tracker for `SHOP-1/WORK#1`, and the first observation fails" }
  - { id: S4, kind: code, ref: "plugins/prove/src/plugin.ts", symbol: "unitOf", said: "the proving plugin and feature-grooming each keep a private `unitOf` that splits the id on `/`; ticket-to-qa has none: the knowledge is copied, not owned" }
  - { id: S5, kind: code, ref: "examples/a-whole-project/tests/project.test.ts", said: "the whole-project example never runs ticket-to-qa: it sets the WORK child to DONE by hand, and it runs actions with runAction, past the boot check the daemon does" }
  - { id: S6, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", symbol: "ask", said: "a read-only run passes --permission-mode plan; a writing run passes no mode, and with ISOLATED dropping the user's settings a print-mode run is refused every edit and command. The codex harness passes workspace-write for the same case" }
  - { id: S7, kind: code, ref: "packages/core/src/actions.ts", symbol: "CORE_ACTIONS", said: "`escalate` is the core's tracker.createFollowUp; the proving plugin's handler named `escalate` only tells the notifier, so the core counts a tracker write the phase never makes and does not need" }
  - { id: S8, kind: code, ref: "packages/core/src/mount.ts", symbol: "catalogued", said: "a handler runs only an action the catalogue names; the proving plugin catalogues none of lease, renew, prepare, run-step, ask and finish, and a called phase cannot register them, so the boot check refuses it: \"action `lease`: nothing defines it\"" }
  - { id: S9, kind: decision, said: "the core owns what unit a called record is for, and a shipped workflow is proven both standing alone and called as a phase, by the same worlds. Proposed 2026-11-11" }
  - { id: S10, kind: decision, said: "a harness run that is not read-only can write by default; the mode is configuration, never absent. Proposed 2026-11-11" }
  - { id: S11, kind: decision, said: "a workflow's own action may not take a core action's name; it is catalogued by the plugin that ships it, and a called phase's catalogue reaches the mount. Proposed 2026-11-11" }
touches:
  - packages/core/src/calls.ts
  - packages/core/src/index.ts
  - packages/core/src/mount.ts
  - packages/core/tests/calls.test.ts
  - packages/core/tests/mount.test.ts
  - packages/workflow-testkit/src/conforms.ts
  - packages/workflow-testkit/src/index.ts
  - packages/workflow-testkit/tests/conforms.test.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/harness-conformance.test.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/tests/conformance.test.ts
  - examples/workflow-feature-grooming/src/plugin.ts
  - examples/a-whole-project/tests/project.test.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/src/decide.ts
  - plugins/prove/tests/human-step.test.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/src/config.ts
  - plugins/claude/src/plugin.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - plugins/claude/README.md
  - plugins/codex/tests/CodexHarness.test.ts
  - .software-factory/rules/a-called-record-names-its-unit.yaml
  - docs/design/a-workflow-calls-another.md
criteria:
  - { id: A1, statement: "the core exports unitOf(record), the unit a record is for at any call depth (`SHOP-1/WORK#1/X#2` → `SHOP-1`, `SHOP-1@acme%2Fshop` keeps its repo part), and ticket-to-qa, feature-grooming and the proving plugin use it; their private copies are gone", proof: "deferred:test:packages/core/tests/calls.test.ts", sources: [S2, S3, S4, S9] }
  - { id: A2, statement: "the workflow testkit runs every conformance world twice, at the top and called under `UNIT/PHASE#1`, and fails when the two name a different unit to the tracker or code host, write differently or end differently", proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts", sources: [S3, S5, S9] }
  - { id: A10, statement: "every shipped workflow's conformance suite runs its worlds called as a phase too", proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts", sources: [S9] }
  - { id: A12, statement: "ids that key a run rather than a unit (a checkout, an agent's context) may differ between the two runs, and stay distinct per record", proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts", sources: [S2, S9] }
  - { id: A3, statement: "ticket-to-qa's conformance worlds pass as a called phase: the tracker is asked for the ticket, the branch and the pull request name the ticket, never the call", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts", sources: [S1, S3] }
  - { id: A4, statement: "the whole-project example boots through the same boot check the daemon runs, with no unmet need, and walks WORK through ticket-to-qa's real actions on the fakes to its QA handoff; no test sets a child's state by hand", proof: "deferred:test:examples/a-whole-project/tests/project.test.ts", sources: [S5, S8] }
  - { id: A5, statement: "a claude run that is not read-only passes --permission-mode with the configured mode, `acceptEdits` unless set; a read-only run is still plan; an empty, unknown or non-writing mode (plan) is refused at mount, naming the setting", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S6, S10] }
  - { id: A6, statement: "a harness conformance in agent-kit, run against claude and codex, fails any harness whose writing run is handed no way to write or whose read-only run is handed one", proof: "deferred:test:packages/agent-kit/tests/harness-conformance.test.ts", sources: [S6, S10] }
  - { id: A7, statement: "the proving plugin catalogues lease, renew, prepare, run-step, ask, finish and give-up itself; its gave-up notice is `give-up`, and mounted as a phase it needs no tracker", proof: "deferred:test:plugins/prove/tests/human-step.test.ts", sources: [S7, S8, S11] }
  - { id: A8, statement: "a called phase's own catalogue entries reach the mount, and a handler for a core action in a workflow that does not need the catalogue's port is refused at boot, naming both", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S7, S8, S11] }
  - { id: A9, statement: "a factory rule refuses code outside packages/core that splits a record id on `/` or `#`, and its mutation test is red on the 0.7.1 sources", proof: "deferred:unspecified:sf check on the pull request", sources: [S4, S9] }
  - { id: A11, statement: "a test mounts every shipped workflow and fails when one implements a core action on a port it does not need; prove 0.7.1's `escalate` trips it, ticket-to-qa's handlers do not", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S7, S11] }
crosses:
  - { mechanism: calls, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:test:packages/core/tests/mount.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts" }
  - { mechanism: config, answer: works, proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "agent-kit only gains a harness conformance; no attempt or wait changes" }
  - { mechanism: agent-replies, answer: n/a, why: "what an agent says is not read differently; only whether its run may write" }
guarantee:
  - { holds: "every workflow amy ships behaves the same called as a phase as standing alone", not_against: "a third-party workflow that reads record.id itself and does not run the testkit's called worlds" }
  - { holds: "an agent run amy hands work to can write, and a read-only one cannot", not_against: "a CLI that changes what its permission modes mean" }
  - { holds: "a core action's name means the catalogue's write in every shipped plugin", not_against: "two third-party plugins agreeing on a name the core does not ship" }
failures:
  - { step: mount, when: "a workflow implements a core action without needing the port the catalogue runs it on", goes_to: "a refused boot naming the action and that port" }
  - { step: mount, when: "the claude permissionMode setting is empty, unknown or a mode that cannot write", goes_to: "a refused boot naming the setting and the writing modes" }
cut:
  - "the rest of what a proof needs (http.request, screenshots and recordings, a resource booting the work's branch): a proof runs against its own branch"
  - "taking up a pull request already open: its own plan, after this one"
  - "renaming ticket-to-qa's handlers of core actions: they implement them, on the ports the catalogue names"
  - "amy update and --install-links on a file: plugin: install-and-update, already listed"
exit: "a project of amy's shipped brief, ticket-to-qa and prove phases walks BRIEF → WORK → PROVE → DONE on the fakes with no fork, and the gate goes red if any of the three bugs comes back"
---
# A shipped workflow runs as a phase

Called as phases, three shipped pieces break: ticket-to-qa takes its call's
id for a ticket, claude's writing runs may not write, and prove takes the
core's `escalate` and catalogues none of its actions. The example hid all
three. This plan fixes each at its owner, and gates every shipped workflow
called as a phase, every harness's writing run and every core action's port.
