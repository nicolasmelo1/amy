---
base: c39407fa4068fd8c3a5282fb9949cb21f6b08101
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/CodeHost.ts", symbol: "CodeHost", said: "a review thread is resolved by id and nothing in the port says an answer on the thread itself, so a reply can only be repeated in a chat or on the ticket" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Conversation.ts", symbol: "Conversation", said: "a chat says a reply in a room and reads the owner's word from it; the room is not the thread a person wrote on" }
  - { id: S3, kind: code, ref: "packages/core/src/ports/Tracker.ts", symbol: "Tracker", said: "the ticket carries a comment and reads what the owner wrote there, which is the other place an answer was said" }
  - { id: S4, kind: friction, said: "2026-11-20: a private project's ticket workflow answered a review on the ticket while the reviewer was reading the thread, so the person had to go and look somewhere else for the answer to their own question" }
  - { id: S5, kind: decision, said: "where a reply is said and where the owner's word is read from is one setting, `repliesOn`, naming ports (conversation, code-host, tracker) and never products. Required, no default. Decided 2026-11-21" }
  - { id: S6, kind: decision, said: "a port the setting names that nobody mounts refuses at mount, naming the port, so an install cannot answer into a place the machine does not hold. Decided 2026-11-21" }
  - { id: S7, kind: code, ref: "plugins/codex/src/CodexHarness.ts", symbol: "classify", said: "a codex turn that completed with no message was read as failed, so an implementing run that looked and changed nothing climbed a rung to find the same nothing" }
  - { id: S8, kind: code, ref: "packages/cli/src/update.ts", symbol: "migrateSettingsFile", said: "an install that kept a config from an older release moves nothing unless the update writes it, and a setting with no default leaves the ticket workflow refusing to mount" }
touches:
  - packages/core/src/ports/CodeHost.ts
  - plugins/github/src/GitHubCodeHost.ts
  - plugins/github/tests/GitHubCodeHost.test.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/a-turn-that-completed.test.ts
  - examples/workflow-pull-request/tests/hosts.test.ts
  - examples/workflow-ticket-to-qa/src/replies.ts
  - examples/workflow-ticket-to-qa/tests/rung-by-origin.test.ts
  - examples/workflow-ticket-to-qa/tests/retry.property.test.ts
  - packages/cli/src/config.ts
  - packages/cli/src/update.ts
  - packages/cli/tests/update.test.ts
  - packages/cli/tests/escalation-config.test.ts
  - registry/plugin-github.json
  - registry/plugin-codex.json
  - docs/concepts/ports.md
  - docs/reference/contracts.md
  - docs/start/configuration.md
criteria:
  - { id: A1, statement: "an answer on a review thread is written on the thread itself, as a comment and not a resolution; a body the host refuses fails the call like every mutation", proof: "test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S1, S4, S5], done: true }
  - { id: A2, statement: "the port names the write: reply-thread is a code-host capability and the method that answers to it, and a host that offers no reply refuses before the write", proof: "test:examples/workflow-pull-request/tests/hosts.test.ts", sources: [S1], done: true }
  - { id: A3, statement: "`repliesOn` names the ports an answer is said on, from conversation, code-host and tracker; a product name, an empty list or a missing setting is refused at mount, naming both", proof: "test:examples/workflow-ticket-to-qa/tests/plugin.test.ts", sources: [S2, S3, S5, S6], done: true }
  - { id: A4, statement: "`amy update` writes `repliesOn` into a config that predates it, naming both ports, and says what it wrote; a config that already names it is left alone", proof: "test:packages/cli/tests/update.test.ts", sources: [S8], done: true }
  - { id: A5, statement: "a codex turn that completed is completed however little it said, so a run that looked and changed nothing keeps its rung and its answer is the reason", proof: "test:plugins/codex/tests/a-turn-that-completed.test.ts", sources: [S7], done: true }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "A1, A3; the answer is said on the thread that asked, and where else it is said is the one setting" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "A1, A2; a reply is a thread comment under its own capability, and resolving stays a separate act" }
  - { mechanism: config, answer: works, proof: "A3; the setting is required, its values are the three port names and nothing else" }
  - { mechanism: install-and-update, answer: works, proof: "A4; the update writes the setting it now has no default for" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "A3; a port nobody mounts refuses at mount, before work is touched" }
  - { mechanism: attempts-and-waits, answer: works, proof: "A5; a completed turn keeps its rung, and a run that changed nothing no longer climbs to a stronger model" }
  - { mechanism: record-migration, answer: n/a, why: "a saved record is read as before; the setting lives in the config, not in the record" }
  - { mechanism: calls, answer: n/a, why: "how a workflow calls another is unchanged; the called workflow reads the same setting from its own slice" }
  - { mechanism: hooks, answer: n/a, why: "before, after and interrupt run around every plan as today; no hook reads a reply" }
  - { mechanism: diagram, answer: n/a, why: "no state or transition moves" }
guarantee:
  - { holds: "an answer to a review is written where the person wrote the question", not_against: "a person who reads the ticket and never the thread: the port list is theirs to narrow or widen" }
  - { holds: "an install says where it answers before it mounts, and a port it does not hold refuses at mount", not_against: "a plugin that mounts a port and answers nothing on it" }
  - { holds: "a run that completed keeps its rung, whatever it said", not_against: "a run that crashed or was rate-limited: those still climb" }
failures:
  - { step: reply, when: "the host refuses the body, or offers no reply at all", goes_to: "the write fails as any host write does, and the next look tries again" }
  - { step: mount, when: "`repliesOn` names a product, names nothing, or names a port nobody mounts", goes_to: "the mount is refused naming the setting and the ports it takes (A3)" }
  - { step: update, when: "the config already names `repliesOn`", goes_to: "nothing is written; the operator's list stands" }
cut:
  - "a reply said on every port at once: the setting is a list, and an install that names two answers on two, in the order written"
  - "a product-name setting (`replyOn: slack`) kept beside the port names: amy is its only user and the port vocabulary is the whole of it (S5)"
exit: "an answer to a review is written on the thread that asked, one required port-named setting says where it is said, a mount naming a port nobody holds refuses, and a completed run keeps its rung"
---

# A reply is said where the config names it

An answer to a review went to the chat or the ticket, never to the thread that
asked it. The code host now replies on the thread under its own capability, and
`repliesOn` — required, port-named — says where an answer is said and where the
owner's word is read from. A mount naming a port it does not hold refuses, and
`amy update` writes the setting into a config that predates it.
