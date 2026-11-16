---
base: ea3014a747fa2dc792c45f983de075e834bd5452
sources:
  - { id: S1, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts", symbol: "withSkill", said: "a step's skill is put before the prompt as /name and its directory handed to every rung, whatever harness the rung runs on" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Harness.ts", symbol: "lendsSkill", said: "a harness that cannot be handed a skill leaves lendsSkill unset, and a turn addressed to a skill is refused on it" }
  - { id: S3, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", symbol: "lend", said: "only claude sets lendsSkill and reads AskContext.skill, through a fresh --add-dir linking to the skill" }
  - { id: S4, kind: code, ref: "plugins/codex/src/CodexHarness.ts", symbol: "isolatedHome", said: "codex runs with a fresh CODEX_HOME holding only auth.json, so no skill of the operator's or amy's reaches it, and AskContext.skill is never read" }
  - { id: S5, kind: code, ref: "plugins/hermes-agent/src/HermesHarness.ts", symbol: "HermesHarness", said: "hermes sets neither lendsSkill nor skillsDirectory: a skill turn is refused in the chat, and harnessSkills.hermes-agent is refused at boot" }
  - { id: S6, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "readOnlyAnswer", said: "the chat refuses a skill turn on a harness that does not lend, naming one that does" }
  - { id: S7, kind: reference, ref: "https://developers.openai.com/codex/skills", said: "Codex reads a skill as a directory holding SKILL.md from its skill roots; the user root is documented as $HOME/.agents/skills, older docs say $CODEX_HOME/skills" }
  - { id: S8, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills", said: "Hermes scans ~/.hermes/skills and the directories skills.external_dirs names; the local one wins a name clash" }
  - { id: S9, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/cli", said: "hermes -s/--skills preloads named skills into the session prompt before the first turn, interactive and single-query mode alike; a name it cannot resolve is reported missing" }
  - { id: S10, kind: decision, said: "codex is lent a skill as a link under the fresh CODEX_HOME's skills, one per turn, removed with the home. Proposed 2026-11-15" }
  - { id: S11, kind: decision, said: "hermes is lent a skill with -s <name>; amy's profile names amy's skill root under skills.external_dirs, set and checked by amy setup hermes like the other profile settings. Proposed 2026-11-15" }
  - { id: S12, kind: decision, said: "a step's skill ladder over a model ladder with a rung on a harness that does not lend is refused at boot, naming the rung, rather than sent bare. Proposed 2026-11-15" }
  - { id: S13, kind: friction, said: "2026-11-15: a-skill-is-asked-for-in-the-chat was marked done, but only claude loads a skill; codex and hermes either refuse or receive /name with nothing behind it" }
touches:
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/agent-kit/src/harness-conformance.ts
  - packages/agent-kit/tests/HarnessRelay.test.ts
  - packages/agent-kit/tests/harness-conformance.test.ts
  - packages/core/src/ports/Harness.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/src/skills.ts
  - plugins/agent-relay/tests/plugin.test.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - plugins/hermes-agent/src/HermesHarness.ts
  - plugins/hermes-agent/src/plugin.ts
  - plugins/hermes-agent/src/profile.ts
  - plugins/hermes-agent/tests/HermesHarness.test.ts
  - plugins/hermes-agent/tests/setup.test.ts
  - plugins/codex/package.json
  - plugins/hermes-agent/package.json
  - registry/plugin-codex.json
  - registry/plugin-hermes-agent.json
  - registry/plugin-agent-relay.json
  - registry/core.json
  - registry/agent-kit.json
  - docs/concepts/harnesses.md
  - plugins/codex/README.md
  - plugins/hermes-agent/README.md
criteria:
  - { id: A1, statement: "a codex turn with AskContext.skill runs with that skill linked under its fresh CODEX_HOME's skills, nothing else of the operator's, and the link goes with the home", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S4, S7, S10] }
  - { id: A2, statement: "codex sets lendsSkill, and a skill whose directory holds no SKILL.md is not lent, as on claude", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S2, S3, S10] }
  - { id: A3, statement: "a hermes turn with AskContext.skill passes -s <name> and nothing else changes in its arguments; hermes sets lendsSkill", proof: "deferred:test:plugins/hermes-agent/tests/HermesHarness.test.ts", sources: [S5, S9, S11] }
  - { id: A4, statement: "amy setup hermes writes amy's skill root into the profile's skills.external_dirs, and the profile check reports it drifted when it is gone", proof: "deferred:test:plugins/hermes-agent/tests/setup.test.ts", sources: [S8, S11] }
  - { id: A5, statement: "hermes reports skillsDirectory, so harnessSkills.hermes true mounts and links its skills", proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts", sources: [S5, S8] }
  - { id: A6, statement: "where codex's user skills are, ~/.agents/skills or CODEX_HOME/skills on codex 0.166, is read from the CLI before skillsDirectory changes", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S7] }
  - { id: A7, statement: "a skills ladder for a step whose model ladder has a rung on a harness without lendsSkill is refused at boot, naming the step and the rung", proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts", sources: [S1, S2, S12] }
  - { id: A8, statement: "the relay never sends /name to a rung it did not hand the skill to: the conformance suite fails a harness that receives a skill turn without lendsSkill", proof: "deferred:test:packages/agent-kit/tests/harness-conformance.test.ts", sources: [S1, S2, S13] }
  - { id: A9, statement: "/amy-groom in the chat is answered with the skill lent on each of claude, codex and hermes, on stand-in CLIs", proof: "deferred:test:packages/agent-kit/tests/harness-conformance.test.ts", sources: [S6, S13] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A9" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A7" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a rung refused at boot never runs, so a turn's attempts and waits climb the ladder as they do today" }
  - { mechanism: config, answer: n/a, why: "skills and harnessSkills keep their shape; only which harnesses can satisfy them grows" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "a harness is handed a skill to read; nothing is written to a tracker or a host" }
guarantee:
  - { holds: "a turn addressed to a skill runs with that skill, on any harness amy ships, or is refused before it runs", not_against: "a third-party harness plugin that sets lendsSkill and ignores AskContext.skill" }
  - { holds: "codex sees only the skill lent for the turn", not_against: "hermes, which sees every skill in amy's root through external_dirs and is told by -s which one to load" }
failures:
  - { step: ask, when: "hermes reports the -s skill missing", goes_to: "the turn failed naming the skill and amy skills, not answered bare" }
  - { step: setup, when: "hermes config set cannot write skills.external_dirs", goes_to: "the profile check red naming the setting and the command, as the other settings" }
cut:
  - "lending a skill to a third-party harness plugin: its own plan"
  - "merging the three harnesses' cost accounting, found beside this gap: refused here, it changes no skill"
exit: "the same skills ladder lends amy-groom on claude, codex and hermes, and a ladder that could reach a harness without it is refused at boot"
---
# A skill reaches every harness

`a-skill-is-asked-for-in-the-chat` lends a skill only on Claude. The relay
still puts `/name` before a Codex or Hermes rung that never sees the skill.
Codex gets the skill as a link in its fresh home, Hermes through `-s` and
its profile's `external_dirs`. A ladder that could send a skill bare is
refused at boot.
