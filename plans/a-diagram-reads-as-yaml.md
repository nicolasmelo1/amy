---
base: 330ec3de00869241d24025edbd3b6a6eb5184f53
sources:
  - { id: S1, kind: decision, said: "workflow.mmd stays the source of truth: a person understands a drawing, not YAML, as canvas tools and system-design interviews show. Decided 2026-11-05" }
  - { id: S2, kind: decision, said: "a YAML view is derived from the diagram, mmd to yaml, because an agent reads and edits text more easily than Mermaid. Decided 2026-11-05" }
  - { id: S3, kind: decision, said: "yaml to mmd works too, so a person changes a workflow by talking to an agent that edits the YAML and amy redraws the diagram; YAML is never stored as a second source. Decided 2026-11-05" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "the diagram is the shape and the decisions are code; labels are prose; export prints the file, new --from copies a diagram beside notWritten stubs" }
  - { id: S5, kind: code, ref: "packages/core/src/diagram.ts", symbol: "readDiagram", said: "the reader yields states, initial, terminal, the five classes, calls, forks, state labels and transitions, and refuses what it cannot map" }
  - { id: S6, kind: code, ref: "packages/core/src/diagram.ts", symbol: "markState", said: "nothing writes a Diagram back to Mermaid; the only text produced is the file read, plus a marked class" }
  - { id: S7, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "a label naming a published event is read; every other label stays prose" }
  - { id: S8, kind: reference, ref: "docs/design/nothing-is-declared-twice.md", said: "a fact lives in one place; a copy of it is a promise nothing keeps" }
  - { id: S9, kind: decision, said: "the YAML holds exactly what the reader yields: states with label and classes, initial, terminal, transitions with label, calls and forks; a dotted lowercase label is written as event:" }
  - { id: S10, kind: decision, said: "lines amy does not read (comments, classDef, other classes, front matter) travel as an untouched list, so a redraw loses none of them" }
  - { id: S11, kind: decision, said: "an about: block names the workflow, its ports, phases and brief sections from the loaded declaration; it is read-only, and import refuses a YAML whose about differs" }
  - { id: S12, kind: decision, said: "amy workflow export <name> --yaml prints the view; with --work <id> it adds current: <state>" }
  - { id: S13, kind: decision, said: "amy workflow import <name> --yaml <file> runs the YAML through the reader's refusals, rewrites workflow.mmd of a workflow under ~/.amy/workflows, and refuses an installed package" }
  - { id: S14, kind: decision, said: "import writes only the diagram: it prints each new state with no decision and each removed state whose decision is left, and amy workflow check lists them as today" }
  - { id: S15, kind: decision, said: "amy workflow new <name> --from accepts a .yaml as it accepts a .mmd, writing the drawn diagram beside notWritten stubs" }
  - { id: S16, kind: decision, said: "the writer lives in the core with no dependency; the YAML codec lives in the cli, which already depends on yaml" }
touches:
  - packages/core/src/diagram.ts
  - packages/core/src/index.ts
  - packages/core/tests/diagram-writer.test.ts
  - packages/core/tests/diagram-writer.property.test.ts
  - packages/cli/src/diagram-yaml.ts
  - packages/cli/src/workflow.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/diagram-yaml.property.test.ts
  - packages/cli/tests/workflow-export.test.ts
  - packages/cli/tests/workflow-import.test.ts
  - docs/reference/cli.md
  - docs/build/write-a-workflow.md
criteria:
  - { id: A1, statement: "for every diagram the reader accepts, writing it and reading it back gives the same states, classes, calls, forks, labels and transitions", proof: "deferred:property:packages/core/tests/diagram-writer.property.test.ts#a_label_is_dropped", sources: [S1, S5, S6, S16] }
  - { id: A2, statement: "for every accepted diagram, mmd to yaml to mmd reads identically and keeps every line amy does not read", proof: "deferred:property:packages/cli/tests/diagram-yaml.property.test.ts#an_unread_line_is_lost", sources: [S2, S3, S9, S10] }
  - { id: A3, statement: "export --yaml on the three shipped workflows prints states, classes, transitions, events and about, and --work adds current", proof: "deferred:test:packages/cli/tests/workflow-export.test.ts", sources: [S7, S9, S11, S12] }
  - { id: A4, statement: "import of a YAML drawing a composite, a choice or an undrawn initial state is refused with the reader's own message, and workflow.mmd is unchanged", proof: "deferred:test:packages/cli/tests/workflow-import.test.ts", sources: [S4, S5, S13] }
  - { id: A5, statement: "import adding a state rewrites workflow.mmd, names the state that has no decision, and workflow check lists it; an installed package is refused", proof: "deferred:test:packages/cli/tests/workflow-import.test.ts", sources: [S13, S14] }
  - { id: A6, statement: "import of a YAML whose about differs from the declaration is refused naming the field, and no YAML file is left beside the workflow", proof: "deferred:test:packages/cli/tests/workflow-import.test.ts", sources: [S3, S8, S11] }
  - { id: A7, statement: "new --from file.yaml writes the same workflow new --from file.mmd writes for the same drawing", proof: "deferred:test:packages/cli/tests/workflow-import.test.ts", sources: [S4, S15] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A1, A4; the reader is unchanged and every write goes back through it" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A5, A7; check still lists stubs and drawn-not-walked edges after an import" }
guarantee:
  - { holds: "workflow.mmd is the only stored shape; a YAML exists only as printed output or a file the person passes in", not_against: "a person who saves export's output and edits both by hand" }
  - { holds: "import never writes a diagram the reader would refuse", not_against: "a diagram the reader accepts that misdraws what the person meant" }
failures:
  - { step: import, when: "the YAML fails the reader's refusals", goes_to: "refused with the reader's message; workflow.mmd unchanged" }
  - { step: import, when: "the workflow is an installed package", goes_to: "refused, naming amy workflow add as the way to own a copy" }
  - { step: export, when: "the workflow has no diagram", goes_to: "the message export gives today" }
cut:
  - "YAML as an authored or stored source: refused (S1, S3)"
  - "when: conditions read from prose labels: a-decision-is-asked-of-a-port's"
  - "importers of other tools' formats: later, and they target this YAML"
  - "editing decide.ts on import: refused, decisions are code the person writes"
exit: "a person asks an agent to add a state to their workflow; the agent edits the output of amy workflow export --yaml, amy workflow import redraws workflow.mmd, and amy workflow check names the one decision left to write"
---
# A diagram reads as YAML

The diagram is the shape a person draws and reads. An agent edits text more easily,
so amy prints the diagram as YAML and redraws the diagram from it, keeping one source.
