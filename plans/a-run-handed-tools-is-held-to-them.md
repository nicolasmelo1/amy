---
base: f7c921d26a01f467d6a6e7ac1cdb484bac55f919
sources:
  - { id: S1, kind: friction, said: "2026-11-19: a private project's discussion step may run one read-only command and nothing else; the prompt asked the agent to keep to it, and under acceptEdits the CLI let it run any other" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Harness.ts", symbol: "AskContext", said: "a run can be marked readOnly, which a harness enforces through its own sandbox or refuses; nothing names which tools a run may use" }
  - { id: S3, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", said: "a run goes under --permission-mode plan when readOnly, otherwise the configured permissionMode, acceptEdits by default; no --allowedTools is ever passed" }
  - { id: S4, kind: reference, ref: "https://code.claude.com/docs/en/permission-modes", said: "under dontAsk every tool not pre-approved is denied rather than asked about; acceptEdits allows edits and common filesystem commands" }
  - { id: S5, kind: reference, ref: "https://code.claude.com/docs/en/cli-reference", said: "--allowedTools names the tools that run without asking, Bash(<prefix>:*) included" }
  - { id: S6, kind: code, ref: "plugins/codex/src/CodexHarness.ts", said: "a codex thread is started with sandbox read-only or workspace-write and approvalPolicy never; the app-server is given no list of allowed tools" }
  - { id: S7, kind: code, ref: "plugins/hermes-agent/src/HermesHarness.ts", symbol: "ask", said: "hermes -z runs with approvals bypassed and is handed no tool list; a readOnly run is refused before it starts so the relay hands it to a harness that can enforce it" }
  - { id: S8, kind: decision, said: "AskContext gains tools, a list of tool names; a harness that can hold a run to exactly those does, and one that cannot refuses the run before it starts, as it does readOnly. Decided 2026-11-19, in the private project's fork" }
  - { id: S9, kind: decision, said: "claude holds a run handed tools with --permission-mode dontAsk --allowedTools, adding Read, Grep and Glob so the run can still read the tree it runs in. Decided 2026-11-19, in the private project's fork" }
touches:
  - packages/core/src/ports/Harness.ts
  - packages/agent-kit/src/harness-conformance.ts
  - packages/agent-kit/tests/harness-conformance.test.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - plugins/hermes-agent/src/HermesHarness.ts
  - plugins/hermes-agent/tests/HermesHarness.test.ts
  - docs/concepts/harnesses.md
criteria:
  - { id: A1, statement: "a claude run handed tools runs under --permission-mode dontAsk with --allowedTools naming Read, Grep, Glob and every tool given, whatever permissionMode is configured; a run handed none is unchanged", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1, S3, S4, S5, S9] }
  - { id: A2, statement: "a claude run handed both tools and readOnly runs under plan, the stricter of the two, and names no tool that writes", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S3, S8] }
  - { id: A3, statement: "a codex run and a hermes-agent run handed tools are refused before any process starts, spending nothing and saying the harness cannot hold a run to a tool list, so a relay hands the step to the next rung", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S6, S7, S8] }
  - { id: A4, statement: "the harness conformance suite asks every harness for a run handed tools, and passes a harness only when it ran held to them or refused before starting", proof: "deferred:test:packages/agent-kit/tests/harness-conformance.test.ts", sources: [S2, S8] }
  - { id: A5, statement: "an empty tools list, or one holding a blank name, is read as no list: the run is unchanged on every harness", proof: "deferred:test:plugins/hermes-agent/tests/HermesHarness.test.ts", sources: [S8] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A3; a refused run reads as refused, the same reply readOnly's refusal gives" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A3; a run refused before it starts spends no attempt, as readOnly's does" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "only the Harness port gains a field; no tracker or code host write changes" }
guarantee:
  - { holds: "a run handed tools uses no tool outside them and the three readers, or does not run", not_against: "a tool the CLI itself runs with no permission check, which no flag amy passes can stop" }
failures:
  - { step: ask, when: "a run handed tools reaches codex or hermes-agent", goes_to: "refused before it starts, and the relay asks the next rung" }
  - { step: ask, when: "every rung refuses", goes_to: "the step fails as a ladder with no rung left does today" }
cut:
  - "mapping a tool list onto codex's sandbox or a hermes toolset: refused until either CLI can name single tools; a coarser sandbox is not the list the step asked for"
exit: "a step that names its tools runs on claude held to them, and is refused on codex and hermes-agent before it starts"
---

# A run handed tools is held to them

A step that may run one command and nothing else only asked nicely, in its
prompt. The harness port gains a tool list: Claude holds a run to it with
`dontAsk` and `--allowedTools`, and a harness that cannot refuses the run, as
it already refuses a read-only one it cannot enforce.
