---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: decision, said: "a Composition page shows each building block amy has with a pictogram and two lines; it feeds the guided setup, the chat's create-workflow tab and the nodes' pictograms. Decided 2026-11-12" }
  - { id: S2, kind: reference, ref: "https://joydle.github.io/borg/", said: "Borg's Composition grid: one card per node type with a pictogram, its call and two lines; sequencing, fan-out, control and recovery as filters" }
  - { id: S3, kind: code, ref: "packages/core/src/diagram.ts", symbol: "DIAGRAM_CLASSES", said: "a state may be classed waiting, attention, anywhere, returns or call; `<<fork>>` and `<<join>>` split and meet lanes; `STATE --> [*]` ends work" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-calls-another.md", said: "a call state runs another workflow, and its edges out are named for where that one ends" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-runs-on-lanes.md", said: "a fork's lanes run side by side, each a call of its own, and the record moves to the join once every lane has ended" }
  - { id: S6, kind: code, ref: "packages/core/src/work.ts", symbol: "attemptsIn", said: "a state counts the attempts it charged, so an edge back to it is a loop its policy caps" }
  - { id: S7, kind: code, ref: "packages/agent-kit/src/ladder.ts", symbol: "nextRung", said: "a failed rung climbs to the next model, then harness; a rate limit skips the harness; abandoned stops" }
  - { id: S8, kind: reference, ref: "docs/design/a-view-is-data.md", said: "a plugin describes and every renderer draws, so a pictogram must be data a terminal can draw too" }
  - { id: S9, kind: decision, said: "one list in @amykit/ui is the only place a block's name, two lines, pictogram and example diagram are written; the docs page is generated from it. Proposed 2026-11-12" }
  - { id: S10, kind: decision, said: "a pictogram is a grid of at most 4 by 8 cells, filled, outlined or empty: SVG on the web, block characters in a terminal. Proposed 2026-11-12" }
touches:
  - packages/ui/src/blocks.ts
  - packages/ui/src/index.ts
  - packages/ui/tests/blocks.test.ts
  - packages/ui/tests/blocks.property.test.ts
  - scripts/docs/sources/composition.ts
  - scripts/docs/blocks.ts
  - scripts/docs/lib/facts.ts
  - scripts/docs/generate.ts
  - scripts/docs/tests/composition.test.ts
  - docs/concepts/composition.md
  - docs/guides/write-a-workflow.md
criteria:
  - { id: A1, statement: "the list holds one block each for a state, a waiting state, an attention state, a terminal, a loop back with its attempt cap, a fork with lanes, a call, anywhere, returns and the harness ladder", proof: "deferred:test:packages/ui/tests/blocks.test.ts", sources: [S1, S3, S4, S5, S6, S7] }
  - { id: A2, statement: "every diagram class and every pseudo state the reader accepts has exactly one block, so a class added to the reader without one fails", proof: "deferred:property:packages/ui/tests/blocks.property.test.ts#a_class_without_a_block", sources: [S3, S9] }
  - { id: A3, statement: "each block's example diagram is read by readDiagram and has the feature it names", proof: "deferred:test:packages/ui/tests/blocks.test.ts", sources: [S3, S4, S5] }
  - { id: A4, statement: "for any block, its pictogram fits 4 by 8 cells and draws the same cells as SVG and as block characters", proof: "deferred:property:packages/ui/tests/blocks.property.test.ts#svg_and_text_disagree", sources: [S8, S10] }
  - { id: A5, statement: "docs:generate writes the Composition page from the list, one card per block with its pictogram, two lines and example; docs:check fails when they drift", proof: "deferred:test:scripts/docs/tests/composition.test.ts", sources: [S1, S2, S9] }
  - { id: A6, statement: "Write a workflow links each block it uses to its card on the Composition page", proof: "deferred:test:scripts/docs/tests/composition.test.ts", sources: [S1] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A4; a pictogram is data, and the two drawings are compared cell by cell" }
  - { mechanism: diagram, answer: n/a, why: "the reader is only called on each block's example; nothing it accepts or refuses changes" }
guarantee:
  - { holds: "a block's name, lines and pictogram are written once and every surface reads that list", not_against: "a consumer plan that draws its own pictogram instead of reading the list" }
  - { holds: "every class the diagram reader accepts is explained on the page", not_against: "a meaning a workflow gives a class beyond what the reader enforces" }
failures:
  - { step: docs:generate, when: "a block's example no longer reads", goes_to: "generation fails naming the block and the reader's refusal" }
cut:
  - "the setup, the chat's create-workflow tab and the nodes using the list: each in its own plan, reading it"
  - "filters by kind on the page: four groups at most, as headings"
exit: "the Composition page shows every block amy's diagrams accept, each with its pictogram, two lines and an example that reads, all generated from the one list the window and setup can import"
---
# The building blocks are drawn once

Someone new can't tell what a waiting state, a call, a fork or the ladder
does without reading design notes. This plan writes each building block
once in `@amykit/ui`: a name, two lines, a pictogram any renderer can draw,
and an example that reads. The docs Composition page is generated from that
list.
