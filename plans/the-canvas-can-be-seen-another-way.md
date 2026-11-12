---
base: 1471c13ea5a21e998b417b336683844b0932092f
sources:
  - { id: S1, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "a plugin fills a node, a sidebar, a corner icon, a ⋯ or a menu bar row; none lets a person see the whole canvas another way" }
  - { id: S2, kind: decision, said: "the canvas's nodes can be laid out top to bottom or left to right, and the canvas can be switched to a Kanban of every record's state. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "the Kanban has a column per state of the chosen workflow, in the diagram's order, and a card per record in that state with its standing; choosing a card chooses the record in the breadcrumb. Proposed 2026-11-12" }
  - { id: S4, kind: decision, said: "nodes and Kanban ship and cannot be removed; the view and the layout in use are kept per person in config.yaml ui.canvas (view: nodes, layout: top-down). Proposed 2026-11-12" }
  - { id: S5, kind: decision, ref: "docs/design/a-view-is-data.md", said: "a plugin contributes to ui-canvas-view, naming the view: a function from the canvas's snapshot slice to a tree of primitives" }
  - { id: S6, kind: decision, said: "a view no plugin contributes is refused at boot by name, with the list of those that are" }
  - { id: S7, kind: decision, said: "a view only reads and acts through frame.yaml's actions: a click on a card is item.open, its ⋯ is item.menu; ui-action stays the only way to add an action" }
  - { id: S8, kind: reference, ref: "plans/a-page-is-drawn-only-where-it-can-be.md", said: "a view declares the surfaces it draws; elsewhere the canvas falls back to nodes and says which view and why, never an empty canvas" }
  - { id: S9, kind: reference, ref: "https://github.com/zuccs/herdr-office-layout", said: "herdr's community office layout: a worker types while its agent runs and blinks NEEDS YOU when blocked; in herdr a layout is the whole window" }
  - { id: S10, kind: decision, said: "the vocabulary gains semantic, renderer-drawn data: Scene, a fixed grid scaling to the canvas; Place, a child at a cell sized in cells" }
  - { id: S11, kind: reference, ref: "plans/what-needs-you-is-counted-everywhere.md", said: "Sprite: a served image with named frames, chosen by the record's standing (attention, active, waiting, finished); the renderer animates, the plugin runs no code in the window" }
  - { id: S12, kind: decision, said: "seeing your agents as a building is a canvas view and nothing more: the plugin brings no frame of its own, because a window every plugin rearranges is another product. Decided 2026-11-04" }
  - { id: S13, kind: decision, said: "ui-frame's conformance world switches to Kanban, opens a record by a card, switches to a scene view and back; the breadcrumb, sidebar and corners project the same throughout" }
touches:
  - packages/ui/src/vocabulary.ts
  - packages/ui/src/primitives.ts
  - packages/ui/src/frame/frame.ts
  - packages/ui/tests/scene.test.ts
  - packages/ui/tests/vocabulary.test.ts
  - packages/ui/tests/vocabulary.property.test.ts
  - packages/ui-conformance/src/script.ts
  - packages/ui-conformance/src/world.ts
  - packages/core/src/mount.ts
  - packages/cli/src/config.ts
  - plugins/ui-webview/src/kanban.tsx
  - plugins/ui-webview/src/canvas.tsx
  - plugins/ui-ink/src/kanban.tsx
  - packages/cli/tests/ui-plugins.test.ts
  - packages/cli/tests/ui-config.test.ts
  - .software-factory/policy.yaml
  - plugins/ui-webview/package.json
  - plugins/ui-ink/package.json
criteria:
  - { id: A1, statement: "switching the canvas between top-down and left-right moves only node positions: every node, edge and mark is the same, in the app; the terminal draws its list unchanged", proof: "deferred:assertion:frame.a_layout_moves_only_the_nodes", sources: [S2, S4] }
  - { id: A2, statement: "the Kanban holds one column per state in the diagram's order and every record of the workflow on exactly one card, the column of its state, in every renderer", proof: "deferred:assertion:window.the_kanban_is_amy_status", sources: [S2, S3] }
  - { id: A3, statement: "choosing a card chooses the same record, with the same nodes and sidebar, as choosing it in the breadcrumb", proof: "deferred:assertion:frame.a_card_opens_what_the_breadcrumb_opens", sources: [S3, S7, S13] }
  - { id: A4, statement: "switching the canvas to any view changes the canvas and nothing else: the breadcrumb, sidebar and corners project the same before and after", proof: "deferred:assertion:frame.a_canvas_view_changes_only_the_canvas", sources: [S1, S5, S12, S13] }
  - { id: A5, statement: "a view naming an action frame.yaml does not list is refused at boot, naming the view and the action", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S7] }
  - { id: A6, statement: "ui.canvas naming a view nothing contributes, or a layout that is neither top-down nor left-right, is refused at boot with what is installed", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S4, S6] }
  - { id: A7, statement: "a view on a renderer it does not draw falls back to nodes and says which view and why", proof: "deferred:assertion:frame.a_view_falls_back_where_it_cannot_be_drawn", sources: [S8] }
  - { id: A8, statement: "Scene, Place and Sprite refuse a property they do not declare and a sprite frame that is not a standing", proof: "deferred:property:packages/ui/tests/vocabulary.property.test.ts#inherited_key_read_as_declared", sources: [S10, S11] }
  - { id: A9, statement: "an escalated record's sprite shows its attention frame with no ui block at all", proof: "deferred:test:packages/ui/tests/scene.test.ts", sources: [S9, S11] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A5" }
  - { mechanism: config, answer: works, proof: "deferred:A6" }
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A4, A7, A8" }
guarantee:
  - { holds: "a view sends the same intents a node sends, so it is never a road to a write the nodes do not have", not_against: "a plugin whose view names an action frame.yaml does not list" }
cut:
  - "a view replacing the whole window, as a herdr layout does: refused, the frame stays closed (S12)"
  - "a Kanban across every workflow at once: later; a column is a state, and states belong to one workflow"
exit: "a person flips the canvas to left-right, then to Kanban and opens TBO-1 from its card, then to an outside plugin's office view where the escalated worker stands out; the terminal shows Kanban and says why not the office"
---
# The canvas can be seen another way

The canvas draws a workflow as nodes, top to bottom or left to right. The
same records can be a Kanban, which ships, or whatever view a plugin brings,
such as an office, without anything outside the canvas moving.
