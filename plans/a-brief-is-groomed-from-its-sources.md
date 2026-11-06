---
base: 26de19c8574aed6e08c5576742c142cb2ffb3efd
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/skills.ts", said: "amy ships every packages/cli/skills/<name>/SKILL.md beside the code, and `amy skills` writes them into the harnesses" }
  - { id: S2, kind: friction, said: "a private workflow holds tickets on a brief, and the skill that grooms one lived only in that workflow, tied to its company and its format; grooming had no skill in amy" }
  - { id: S3, kind: decision, said: "amy ships a generic amy-groom: the method, one question at a time, every requirement sourced or cut, the base pinned; the format and its check come from the workflow that judges the brief" }
  - { id: S4, kind: decision, said: "the skill closes by hand what a check outside the workflow cannot see: paths at the pinned commit, searches finding nothing, and every ticket the split names filed under the feature in the tracker" }
touches:
  - packages/cli/skills/amy-groom/SKILL.md
  - packages/cli/tests/harnesses.test.ts
  - docs/concepts/harnesses.md
criteria:
  - { id: A1, statement: "amy-groom ships with amy, read off disk like every other skill", proof: "test:packages/cli/tests/harnesses.test.ts", sources: [S1, S2] }
  - { id: A2, statement: "the skill carries the method and takes the format from the workflow that judges the brief, whose parser wins", proof: "test:packages/cli/tests/harnesses.test.ts", sources: [S3, S4] }
crosses:
  - { mechanism: briefs, answer: n/a, why: "the skill writes a declaration file a workflow reads; the brief store, and when it is written, are unchanged" }
guarantee:
  - { holds: "the skill names no workflow's keys, refusal codes or check command; it sends the agent to the workflow that judges the brief for them", not_against: "a workflow whose reference and parser disagree: the skill says the parser wins, and cannot tell which of the two the workflow meant" }
  - { holds: "the skill writes a local file and nothing to the tracker, the code host or chat", not_against: "an agent that ignores the skill's text: a skill is instructions, not a capability narrowed at mount" }
failures:
  - { step: "find the workflow that owns the brief", when: "no mounted workflow judges a brief", goes_to: "the skill says so and stops: a declaration nobody reads holds no ticket" }
cut:
  - "a declaration format or checker in amy's core: a brief's format is the workflow's (S3); the core parses no section"
exit: "/amy-groom on a machine with amy installed grooms a brief against whichever mounted workflow judges it, and writes nothing where the team reads"
---
# A brief is groomed from its sources

Grooming had no skill in amy; the one that existed lived inside a private workflow, tied to its format. amy ships the method and leaves the format to the workflow that reads the brief.
