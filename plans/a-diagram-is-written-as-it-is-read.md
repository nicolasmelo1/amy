---
base: 416a55f1e6ca0e6dfa6a6e69d1afbe5e4a71cb67
sources:
  - { id: S1, kind: decision, said: "workflow.mmd stays the only source of truth: a person understands a drawing, not YAML, as canvas tools and system-design interviews show. Decided 2026-11-05" }
  - { id: S2, kind: decision, said: "the accepted subset is six flat line forms an agent edits as well as YAML, so an agent edits workflow.mmd directly and there is no import of YAML. Decided 2026-11-05" }
  - { id: S3, kind: decision, said: "a structured view is printed, read-only, for tools and future importers, and to show beside the shape what only the declaration knows. Decided 2026-11-05" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "the diagram is the shape and the decisions are code; labels are prose; export prints the file" }
  - { id: S5, kind: code, ref: "packages/core/src/diagram.ts", symbol: "readDiagram", said: "the reader yields states, initial, terminal, the five classes, calls, forks, state labels and transitions, and refuses what it cannot map" }
  - { id: S6, kind: code, ref: "packages/core/src/diagram.ts", symbol: "markState", said: "nothing writes a Diagram back to Mermaid; the only text produced is the file read, plus a marked class" }
  - { id: S7, kind: reference, ref: "plans/amy-has-a-window.md", said: "the canvas saves an edited diagram only when the subset reads it, which needs a writer the core does not have" }
  - { id: S8, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "a label naming a published event is read; every other label stays prose" }
  - { id: S9, kind: decision, said: "the writer lives in the core with no dependency, and keeps the lines amy does not read (comments, classDef, other classes, front matter) in place" }
  - { id: S10, kind: decision, said: "amy workflow export <name> --yaml prints states with label and classes, initial, terminal, transitions with label or event:, calls, forks, and an about: block of name, ports, phases and brief sections" }
  - { id: S11, kind: reference, ref: "plans/the-command-line-holds-no-rule.md", said: "every built-in but daemon and after-daemon is an operation in the services contract, and the command line is generated from it" }
  - { id: S12, kind: decision, said: "export --yaml is a format of the workflow export operation in the services, its schema in the contract, so the generated command, route and SDK method carry it alike" }
  - { id: S13, kind: decision, said: "the writer refuses, naming it, a Diagram the reader could not produce: a state name outside NAME or RESERVED in diagram.ts, or a label with a double quote, a newline, or a leading colon or space. Decided 2026-11-08" }
  - { id: S14, kind: decision, said: "a line amy does not read (a note, a style, a class or classDef assignment, any other) that names a state the edit removed is dropped; a new state's lines are written after the last transition. Decided 2026-11-08" }
touches:
  - packages/core/src/diagram.ts
  - packages/core/src/index.ts
  - packages/core/tests/diagram-writer.test.ts
  - packages/core/tests/diagram-writer.property.test.ts
  - packages/services/src/**
  - packages/services/surface.yaml
  - packages/services/openapi.json
  - packages/services/tests/**
  - packages/services/tests/workflow-export.test.ts
  - docs/reference/cli.md
criteria:
  - { id: A1, statement: "for every diagram the reader accepts, writing it and reading it back gives the same states, classes, calls, forks, labels and transitions", proof: "deferred:property:packages/core/tests/diagram-writer.property.test.ts#a_label_is_dropped", sources: [S1, S5, S6, S7, S9] }
  - { id: A2, statement: "for every accepted diagram, writing it keeps every line amy does not read, in its place, except one naming a state the edit removed", proof: "deferred:property:packages/core/tests/diagram-writer.property.test.ts#an_unread_line_is_lost", sources: [S9, S14] }
  - { id: A3, statement: "export --yaml on the shipped workflows prints states, classes, transitions, events and about, writes no file, and its help says the shape is edited in workflow.mmd", proof: "deferred:test:packages/services/tests/workflow-export.test.ts", sources: [S2, S3, S4, S8, S10, S11, S12] }
  - { id: A4, statement: "the writer refuses a Diagram holding a reserved or malformed state name, a label with a double quote or a newline, or a label starting with a colon or a space, naming it, and writes nothing", proof: "deferred:test:packages/core/tests/diagram-writer.test.ts", sources: [S5, S13] }
  - { id: A5, statement: "removing a state drops every unread line naming it, so the written file reads back with no refusal; a state added by the edit has its lines after the last transition", proof: "deferred:property:packages/core/tests/diagram-writer.property.test.ts#an_orphaned_line_is_kept", sources: [S9, S14] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A1, A2, A4, A5; the reader is unchanged and the writer is proven against it" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A3; export gains a format, check is unchanged" }
guarantee:
  - { holds: "workflow.mmd is the only stored shape; the structured view exists only as printed output", not_against: "a person who saves export's output and edits it by hand" }
  - { holds: "anything the writer writes, the reader reads back identically", not_against: "a diagram the reader accepts that misdraws what the person meant" }
  - { holds: "the writer only writes a Diagram the reader could have produced", not_against: "a Diagram built by hand that is valid but draws something other than the person meant" }
failures:
  - { step: write, when: "the Diagram holds a name or label the reader could not have produced", goes_to: "refused naming it; the file is not touched" }
  - { step: export, when: "the workflow has no diagram", goes_to: "the message export gives today" }
cut:
  - "YAML as an authored or stored source: refused (S1)"
  - "import of YAML back into a diagram: refused, an agent edits the diagram (S2)"
  - "when: conditions read from prose labels: a-decision-is-asked-of-a-port's"
  - "importers of other tools' formats: later, and they target the printed view"
exit: "an agent adds a state by editing workflow.mmd and amy workflow check names the decision left to write; export --yaml prints the shape beside its ports; and the writer round-trips every accepted diagram"
---
# A diagram is written as it is read

The diagram is the shape a person draws and an agent edits. The core gains the
writer the reader never had, and export prints the shape structured, read-only.
