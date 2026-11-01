---
sources:
  - { id: S1, kind: reference, ref: "docs/design/a-project-is-three-phases.md", said: "gave a project a brief/ phase; the brief port keeps the sections the workflow declared, in order (BriefRecord.sections, packages/core/src/ports/Brief.ts); amy brief <id> shows one" }
  - { id: S2, kind: friction, said: "nothing checks a brief: readiness — required sections present, every criterion naming its proof — is judged in each workflow's code, with no command to ask it" }
  - { id: S3, kind: friction, ref: "packages/cli/skills/", said: "the only grooming skill was written inside a private workflow against its parser and tracker; amy's shipped skills cover running amy, not deciding what it builds" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "a brief/ workflow declares brief: { sections, check } as one more optional defineWorkflow member beside decide and actions; check(record) → refusal[], each naming section and rule" }
  - { id: S5, kind: decision, said: "amy brief check <id> runs the check against the stored brief and exits non-zero while anything is refused" }
  - { id: S6, kind: decision, said: "a workflow that declares no check is told so by amy doctor, not given a check that always passes" }
  - { id: S7, kind: decision, said: "amy-groom ships in packages/cli/skills/amy-groom/; it reads the workflow's declared sections and the base-branch code through BaseSource before asking anything" }
  - { id: S8, kind: decision, said: "it asks one question at a time in section order, writing answers through the brief port — never a tracker or code host; runs amy brief check after each section, not moving on while refused; stops green, saying so" }
  - { id: S9, kind: decision, said: "it is a skill like the others, installing into any agent that reads skills, including one the operator talks to from a phone" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/brief-check.test.ts
  - packages/cli/tests/doctor.test.ts
  - packages/cli/skills/amy-groom/**
criteria:
  - { id: A1, statement: "amy brief check exits zero on a brief the workflow's check accepts and non-zero naming the section and rule on one it refuses", proof: "deferred:test:packages/cli/tests/brief-check.test.ts", sources: [S1, S2, S4, S5] }
  - { id: A2, statement: "a workflow with a brief/ phase and no exported check is reported by amy doctor", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S6] }
  - { id: A3, statement: "amy-groom names the sections it will ask about from the workflow's declaration, not from a list of its own", proof: "unspecified:a skill's behaviour is checked by a transcript run, and the harness for that is not designed", sources: [S7] }
  - { id: A4, statement: "a brief groomed through the skill is stored through the brief port and amy brief check is green on it", proof: "deferred:scenario through the installed executable, the skill driven by a recorded transcript", sources: [S8, S9] }
  - { id: A5, statement: "the shipped skill names no tracker, no team and no private workflow", proof: "deferred:test reading the skill's text", sources: [S3] }
crosses:
  - { mechanism: calls, answer: n/a, why: "defineWorkflow gains an optional brief member; how one workflow calls another is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "the brief check runs from amy brief check, not around a plan; before, after and interrupt are unchanged" }
cut:
  - "a default check that always passes for a workflow declaring none"
  - "the skill writing to a tracker or code host"
exit: "a workflow declaring four sections and a check gets a brief groomed by the shipped amy-groom from an agent not the one running amy, stored through the brief port, and amy brief check green on it"
---
# Grooming reads the sections its workflow declares

The brief port keeps a workflow's sections, but nothing checks a brief and no
shipped skill grooms one, so a person writing a brief has to know where each
workflow's readiness code lives.
