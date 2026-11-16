---
base: 3dde1070beca73de9ac353ebf919d314d5c09b30
sources:
  - { id: S1, kind: code, ref: "plugins/codex/src/CodexHarness.ts", symbol: "StdioCodexAppServer", said: "codex runs with a fresh CODEX_HOME but the operator's HOME, so $HOME/.agents/skills is read into the run, and a skill is sent only as /name in the text" }
  - { id: S2, kind: code, ref: "plugins/hermes-agent/src/HermesHarness.ts", symbol: "HermesHarness", said: "hermes passes -s and reports whatever exit code hermes gave; unknown_skill reads as abandoned, and a profile-local copy or a directory in no root is not noticed before the run" }
  - { id: S3, kind: code, ref: "plugins/hermes-agent/src/profile.ts", symbol: "prepareProfile", said: "a profile that exists is left alone, so skills.external_dirs is never named on it, and config set replaces the list it had" }
  - { id: S4, kind: reference, ref: "https://developers.openai.com/codex/skills", said: "codex reads a skill as a directory holding SKILL.md with YAML frontmatter from its user roots, $HOME/.agents/skills and $CODEX_HOME/skills" }
  - { id: S5, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills", said: "hermes resolves -s by tier: project, then the profile's own skills, then skills.external_dirs; a same-named local skill wins" }
  - { id: S6, kind: decision, said: "codex is handed the skill explicitly on turn/start as {type:\"skill\",name,path} naming the lent SKILL.md, and runs with HOME and CODEX_HOME on the fresh home so no operator skill is visible. Proposed 2026-11-16" }
  - { id: S7, kind: decision, said: "a harness refuses a skill turn before it runs when the skill cannot be loaded: no SKILL.md, no frontmatter, a higher-tier copy that would answer, or a directory no profile root names. Proposed 2026-11-16" }
  - { id: S8, kind: decision, said: "codex's app-server protocol and hermes's CLI help are vendored from their pinned releases, and the doubles are held to them. Proposed 2026-11-16" }
touches:
  - packages/agent-kit/tests/harness-conformance.test.ts
  - packages/test-fixtures/contracts/codex-app-server.json.gz
  - packages/test-fixtures/contracts/hermes-cli-help.txt
  - packages/test-fixtures/contracts/manifest.json
  - packages/test-fixtures/src/contracts/codex.ts
  - packages/test-fixtures/src/contracts/hermes.ts
  - packages/test-fixtures/src/index.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - plugins/codex/tests/skill-turn.test.ts
  - plugins/codex/tests/held-to-the-contract.test.ts
  - plugins/hermes-agent/src/HermesHarness.ts
  - plugins/hermes-agent/src/profile.ts
  - plugins/hermes-agent/tests/HermesHarness.test.ts
  - plugins/hermes-agent/tests/setup.test.ts
  - plugins/hermes-agent/tests/skill-turn.test.ts
  - plugins/hermes-agent/tests/skill-root.test.ts
  - plugins/hermes-agent/tests/held-to-the-contract.test.ts
  - scripts/contracts.ts
  - scripts/tests/harness-contracts.test.ts
  - registry/plugin-codex.json
  - registry/plugin-hermes-agent.json
  - docs/concepts/harnesses.md
criteria:
  - { id: A1, statement: "a codex skill turn sees the lent skill and no skill of the operator's, and names the lent SKILL.md in an explicit turn/start input", proof: "deferred:test:plugins/codex/tests/skill-turn.test.ts", sources: [S1, S2, S6] }
  - { id: A2, statement: "codex is refused before a turn starts when the SKILL.md is missing or has no frontmatter", proof: "deferred:test:plugins/codex/tests/skill-turn.test.ts", sources: [S1, S4, S7] }
  - { id: A3, statement: "hermes reports unknown_skill as a failed run naming the skill and amy skills", proof: "deferred:test:plugins/hermes-agent/tests/skill-turn.test.ts", sources: [S2, S5] }
  - { id: A4, statement: "hermes is refused before it runs when a profile-local copy would be loaded instead or the lent directory is in no profile root", proof: "deferred:test:plugins/hermes-agent/tests/skill-turn.test.ts", sources: [S2, S5, S7] }
  - { id: A5, statement: "setup writes amy's skill root into an existing profile's skills.external_dirs beside the entries it had, and the doctor accepts only an exact entry", proof: "deferred:test:plugins/hermes-agent/tests/skill-root.test.ts", sources: [S3, S5] }
  - { id: A6, statement: "codex's app-server protocol and hermes's CLI help are vendored from their pinned releases, and the doubles are held to them", proof: "deferred:test:scripts/tests/harness-contracts.test.ts", sources: [S8] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "A3" }
  - { mechanism: profiles-and-state, answer: works, proof: "A5" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a refused turn never runs, so the ladder still climbs on a real failure" }
  - { mechanism: config, answer: n/a, why: "skills.external_dirs is the same setting; only when it is written and how it is read exactly changes" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "a harness reads a skill; nothing is written to a tracker or a host" }
guarantee:
  - { holds: "a turn addressed to a skill runs with that skill on codex and hermes, or is refused before it runs", not_against: "a third-party harness plugin that sets lendsSkill and ignores AskContext.skill" }
  - { holds: "the codex run sees only the skill lent for the turn", not_against: "hermes, which sees every skill in amy's root through external_dirs and is told by -s which one to load" }
failures:
  - { step: ask, when: "codex or hermes cannot load the lent SKILL.md", goes_to: "the turn failed before it ran, naming the skill and why" }
  - { step: setup, when: "skills.external_dirs cannot be written", goes_to: "the profile check red naming the setting and the command" }
cut:
  - "lending a skill to a third-party harness plugin: its own plan"
  - "a schema validator generated from the vendored codex schemas: the request shapes amy sends are checked by hand"
exit: "the red skill-turn, contract and setup tests pass without weakening, and a skill turn on codex or hermes runs with the skill or is refused before it runs"
---
# A skill turn is refused unless the harness can load it

The red tests hold codex and hermes to what their pinned CLIs do: codex sees only
the lent skill and names it explicitly on `turn/start`, hermes fails loudly on
`unknown_skill` and refuses a hidden or unreachable skill before it runs, and
setup names amy's root on a profile that already exists without dropping the
directories it had. Their contracts are vendored beside the doubles, so a
stand-in cannot drift from the CLI it stands in for.
