---
base: f4282cadec995255a7980b86b8927582cde4e9b6
sources:
  - { id: S1, kind: friction, said: "2026-11-18: a profile whose config.yaml sets agent.ladderByStep.chat to [claude:opus] is answered in the chat by Sonnet" }
  - { id: S2, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "harnessFor", said: "a conversation not pinned by /harness is answered by the first mounted harness; no ladder is read" }
  - { id: S3, kind: code, ref: "packages/cli/src/assemble.ts", symbol: "chatPartsOf", said: "the chat's harnesses are the contributed rungs in contribution order, so claude's models [sonnet, opus] put claude:sonnet first" }
  - { id: S4, kind: code, ref: "packages/cli/src/slices.ts", said: "agent.ladder and agent.ladderByStep reach the relay's slice only; nothing hands them to the chat" }
  - { id: S5, kind: code, ref: "plugins/agent-relay/src/plugin.ts", symbol: "ladders", said: "every name in ladder and ladderByStep is resolved against the contributed rungs, and a name nobody contributed is refused at boot" }
  - { id: S6, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts", said: "a workflow step walks rungsFor(step) in order: the next rung after a run that did not complete, and nothing after an abandoned one" }
  - { id: S7, kind: code, ref: "packages/agent-kit/src/tiers.ts", symbol: "contributeTiers", said: "claude, codex and hermes-agent each contribute one rung per configured model, named harness:model, the same way" }
  - { id: S8, kind: code, ref: "plugins/hermes-agent/src/HermesHarness.ts", said: "each harness passes its own model its own way: claude --model, hermes -m, codex the model of its app-server thread" }
  - { id: S9, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "switchHarness", said: "/harness <name> pins one mounted rung to the conversation, kept in its transcript" }
  - { id: S10, kind: code, ref: "packages/cli/src/index.ts", symbol: "chatSkillTable", said: "the chat already reads the skills ladder under the step chat from the config" }
  - { id: S11, kind: decision, said: "the chat climbs as a workflow step climbs, answered by its own ladder, else agent.ladder; /harness still pins one rung. Decided 2026-11-18" }
  - { id: S13, kind: decision, said: "chat is the core's, so its settings live in the chat section beside chat.budget: chat.ladder and chat.skills, never a per-step key; ladderByStep.chat and skills.chat are refused as plans/a-skill-ladder-for-your-own-steps.md says. Decided 2026-11-19" }
  - { id: S14, kind: code, ref: "packages/cli/src/config.ts", symbol: "chatSkills", said: "the chat's skills are read from skills.chat, the workflow steps' map" }
  - { id: S12, kind: decision, said: "every harness amy ships, claude, codex and hermes-agent, is proven on the chat ladder, not claude alone. Decided 2026-11-18" }
touches:
  - packages/core/src/chat/desk.ts
  - packages/core/tests/chat/desk.test.ts
  - packages/cli/src/index.ts
  - packages/cli/src/assemble.ts
  - packages/cli/src/slices.ts
  - packages/cli/tests/chat-ladder.test.ts
  - docs/concepts/harnesses.md
  - docs/reference/configuration.md
  - packages/cli/src/config.ts
  - packages/cli/src/config-template.ts
  - packages/cli/tests/config.test.ts
criteria:
  - { id: A1, statement: "a conversation not pinned by /harness is answered by the first rung of chat.ladder, else of agent.ladder, else by the first mounted rung as today", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S1, S2, S3, S4, S11, S13] }
  - { id: A2, statement: "a chat turn whose run did not complete is asked of the ladder's next rung, saying which rung answered; an abandoned run stops there, as a workflow step does", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S6, S11] }
  - { id: A3, statement: "/harness pins one rung for the conversation and no climb follows it; /new returns the conversation to the chat ladder", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S9, S11] }
  - { id: A4, statement: "a chat ladder naming claude:opus, codex:<model> and hermes:<model> starts each harness's own CLI with that model, and the agent.run logged for the chat names that harness and model", proof: "deferred:test:packages/cli/tests/chat-ladder.test.ts", sources: [S7, S8, S12] }
  - { id: A5, statement: "a chat ladder rung the chat's mount left out is skipped and said once in the reply, naming it; one nobody contributes is refused at boot as the relay refuses it", proof: "deferred:test:packages/cli/tests/chat-ladder.test.ts", sources: [S3, S5] }
  - { id: A6, statement: "chat.skills chooses the method and chat.ladder the model; a skill turn climbs only rungs that can be handed a skill", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S10, S11, S13, S14] }
  - { id: A7, statement: "chat.ladder and chat.skills are typed keys of the chat section, written in the config template beside chat.budget, and a config still using ladderByStep.chat or skills.chat is refused at boot naming its new key", proof: "deferred:test:packages/cli/tests/config.test.ts", sources: [S13] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A1, A7; chat.ladder and chat.skills join chat.budget, and the per-step chat keys are refused with no legacy path" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A5" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A2, A4" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "the chat is still charged only under chat.budget, once per run, whichever rung answers" }
guarantee:
  - { holds: "the chat answers with the model its ladder names first, on claude, codex or hermes-agent alike", not_against: "a harness CLI that ignores the model it is given" }
  - { holds: "a /harness choice is never overridden by the ladder", not_against: "a pinned rung removed from the config, which the conversation is told about" }
failures:
  - { step: answer, when: "every rung of the chat ladder fails the turn", goes_to: "the last rung's refusal is said, naming /harness and the rungs tried; nothing runs" }
  - { step: boot, when: "chat.ladder names a rung no harness plugin contributes", goes_to: "the mount is refused naming it, the same message agent.ladder gets" }
  - { step: boot, when: "the config still sets ladderByStep.chat or skills.chat", goes_to: "the mount is refused naming chat.ladder or chat.skills" }
exit: "a profile with chat.ladder: [claude:opus] answers its chat with Opus; with codex or hermes-agent first in that ladder, that harness answers with the model it names"
---
# The chat climbs its own ladder

The chat answers with whichever rung was contributed first, so a ladder that
names Opus for it is ignored and Sonnet answers. The chat is the core's, so it
reads `chat.ladder` and `chat.skills` beside `chat.budget`, never a workflow
step's key, climbs as a step does, and is proven on all three harnesses.
