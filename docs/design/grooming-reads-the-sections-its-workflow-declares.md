---
base: 361ba0b2b58ad947eb4ac6aa10962886b36f35bc
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
  - { id: S10, kind: decision, said: "in a project every phase may declare sections: prove/ declares its scenario. amy-groom asks the brief's own sections, then each later phase's in walk order, and amy brief check runs every phase's check. Decided 2026-11-06" }
  - { id: S11, kind: decision, said: "a brief check is handed the name and input schema of every operation the mounted plugins offer, so a section can be refused for naming one nothing offers. Decided 2026-11-06" }
  - { id: S12, kind: reference, ref: "docs/design/a-phase-is-proven-not-asserted.md", said: "the scenario is a section of the brief settled while grooming, and the brief check refuses a step naming an operation no mounted plugin offers" }
  - { id: S14, kind: decision, said: "after a section, grooming moves on when every refusal left names a section it has not asked yet, and stops only when the whole check is green, every phase's included. Decided 2026-11-06" }
  - { id: S15, kind: decision, said: "with no brief/ phase, the brief check refuses unless at least one phase declaring sections exports a check; a sections-only phase beside one that judges is fine, and amy doctor says the same. Decided 2026-11-08" }
  - { id: S16, kind: decision, said: "a phase's check runs only once every section that phase declares is answered; the blank ones are refused by name until then, so a check never parses a half-groomed brief. Decided 2026-11-08" }
  - { id: S13, kind: reference, ref: "docs/design/a-plugin-brings-operations-not-commands.md", said: "a plugin declares operations with typed input and output, read before anything mounts" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/brief-check.test.ts
  - packages/cli/tests/doctor.test.ts
  - packages/cli/skills/amy-groom/**
  - packages/cli/src/project.ts
  - packages/cli/tests/project.test.ts
criteria:
  - { id: A1, statement: "amy brief check exits zero on a brief the workflow's check accepts and non-zero naming the section and rule on one it refuses", proof: "test:packages/cli/tests/brief-check.test.ts, assertion:brief_check.a_refused_brief_exits_non_zero_naming_section_and_rule", sources: [S1, S2, S4, S5, S15, S16], done: true }
  - { id: A2, statement: "a workflow with a brief/ phase and no exported check is reported by amy doctor", proof: "test:packages/cli/tests/doctor.test.ts, assertion:brief_check.the_doctor_names_the_brief_check", sources: [S6, S15], done: true }
  - { id: A3, statement: "amy-groom names the sections it will ask about from the workflow's declaration, not from a list of its own", proof: "test:packages/cli/tests/brief-check.test.ts, assertion:brief_check.the_sections_are_the_workflows", sources: [S7], done: true }
  - { id: A4, statement: "a brief groomed through the skill is stored through the brief port and amy brief check is green on it", proof: "assertion:brief_check.the_groomed_brief_is_green", sources: [S8, S9], done: true }
  - { id: A5, statement: "the shipped skill names no tracker, no team and no private workflow", proof: "test:packages/cli/tests/brief-check.test.ts", sources: [S3], done: true }
  - { id: A6, statement: "when prove/ declares a scenario section, amy brief check refuses a brief without it, naming prove/; amy-groom moves past the brief's sections while that is the only refusal, asks it, and stops green once answered", proof: "test:packages/cli/tests/project.test.ts", sources: [S8, S10, S12, S14], done: true }
  - { id: A7, statement: "a phase's check sees every mounted operation's name and input schema, and refuses a section naming one no plugin offers", proof: "test:packages/cli/tests/brief-check.test.ts", sources: [S11, S13], done: true }
crosses:
  - { mechanism: calls, answer: n/a, why: "defineWorkflow gains an optional brief member; how one workflow calls another is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "the brief check runs from amy brief check, not around a plan; before, after and interrupt are unchanged" }
  - { mechanism: briefs, answer: works, proof: "assertion:brief_check.the_groomed_brief_is_stored_through_the_brief_port, assertion:brief_check.the_groomer_writes_only_through_the_brief_port, assertion:brief_check.grooming_asks_the_section_the_check_names_next" }
guarantee:
  - { holds: "amy brief check is green only on a brief the workflow's own check accepts", not_against: "a workflow check that accepts a brief it should refuse" }
  - { holds: "the shipped skill tells the agent to write only through the brief port", not_against: "an agent that ignores the skill and writes to a tracker or code host itself" }
  - { holds: "each answer is written through the brief port under its lock", not_against: "another writer changing a section between the skill reading it and writing its answer" }
cut:
  - "a default check that always passes for a workflow declaring none"
  - "the skill writing to a tracker or code host"
deviations:
  - "packages/core/src/index.ts: exports BriefDeclaration, BriefRefusal, BriefOperation and BriefCheckScope, the types a workflow's brief member is written against"
  - "`amy brief sections` and `amy brief write <id> <section>` beside `check`: the skill needs a door to read the sections and to write through the port (S8); `amy brief <id>` is `show`, its default, unchanged"
  - "amy refuses a declared section the brief leaves blank before asking the workflow's check, naming the phase that declared it: a phase may declare sections with no check (S10), and its sections are still asked for"
  - "`amy brief check --json` answers `next`: a refused section the brief already answers first, else the first refused section in grooming order — the rule of S14 made mechanical, so the skill follows it rather than restating it"
  - "a check that throws is a refusal naming the workflow, not a crash: the check is a workflow's code, run on an operator's command"
  - "a brief declaration naming no section, a blank one or one twice is refused where defineWorkflow reads it"
  - "S7's BaseSource: no command exposes the port, so the skill reads the base the way GitBaseSource does — fetch to a named destination, pin the commit, read with git show and git grep at it, never a checkout"
  - ".software-factory/policy.yaml, .software-factory/evidence/a-brief-is-groomed-through-amy*: the gate holding A4, its scenario through the installed executable and the transcript a separate agent recorded running the shipped skill"
  - "package.json: npm run e2e runs the new scenario"
  - ".software-factory/evidence/**: every activated gate re-run and re-sealed"
  - "README.md, docs/concepts/harnesses.md, docs/development/the-gate.md, docs/reference/cli.md, docs/manifest.json, docs/changelog/index.md: generated from the new commands, the skill, the gate and the changeset"
  - "registry/cli.json, registry/core.json: generated registry items"
  - ".changeset/grooming-reads-the-sections-its-workflow-declares.md: the release note"
  - "plans/next-steps.md, plans/grooming-happens-in-the-window.md: the delivered row leaves the board, and the plan citing this one cites where it lives now"
exit: "a workflow declaring four sections and a check gets a brief groomed by the shipped amy-groom from an agent not the one running amy, stored through the brief port, and amy brief check green on it"
---
# Grooming reads the sections its workflow declares

Nothing checked a brief and the shipped skill asked questions of its own. A
workflow now declares `brief: { sections, check }`; `amy brief check` runs
every phase's check against the stored brief and the mounted operations, and
`amy-groom` asks what it names next, writing through the brief port, until
it is green.
