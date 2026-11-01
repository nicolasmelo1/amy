---
sources:
  - { id: S1, kind: reference, ref: "plans/the-window-takes-plugins.md", said: "a plugin adds a section, tab, action and panel entry; none lets a person see work they have a different way" }
  - { id: S2, kind: reference, ref: "https://github.com/zuccs/herdr-office-layout", said: "herdr's community office layout: a worker types while its agent runs and blinks NEEDS YOU when blocked; in herdr a layout is the whole window (https://herdr.dev/layouts/)" }
  - { id: S3, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "navigation, panel, palette and keys stay whatever is drawn; only a section's canvas opens, when nothing narrower is open in it" }
  - { id: S4, kind: decision, ref: "docs/design/a-view-is-data.md", said: "a plugin contributes to ui-section-view, naming the section and the view: a function from the section default's snapshot slice to a tree of primitives" }
  - { id: S5, kind: decision, said: "the default ships and cannot be removed (Work: the list; Workflows: the diagrams). The view in use is kept per section in config.yaml `ui.views` (e.g. work: office, workflows: default)" }
  - { id: S6, kind: decision, said: "a view no plugin contributes is refused at boot by name, with the list of those that are" }
  - { id: S7, kind: decision, said: "a view only reads and acts through frame.yaml's actions: a desk click is item.open, a worker's ⋯ is item.menu. It cannot name an unlisted action; ui-action stays the only way to add one" }
  - { id: S8, kind: reference, ref: "plans/a-renderer-is-chosen-by-name.md", said: "a view declares the renderer surfaces it holds. Elsewhere (an office in a terminal) the section falls back to its default and the header says which view and why; never an empty canvas" }
  - { id: S9, kind: decision, said: "the vocabulary gains semantic, renderer-drawn data: Scene, a fixed grid scaling to the canvas; Place, a child at a cell sized in cells" }
  - { id: S10, kind: reference, ref: "plans/amy-lives-in-the-menu-bar.md", said: "Sprite: a served package image with named frames, chosen by the record's standing (attention, active, waiting, finished). The renderer animates; the plugin runs no code in the window" }
  - { id: S11, kind: decision, said: "a pet, a time-of-day clock, a wandering worker are frames and places the view picks from the snapshot; nothing in the renderer knows what an office is" }
  - { id: S12, kind: decision, said: "ui-frame's conformance world gains a scene view: switch Work to it, open a record by click, switch back; the surrounding regions project the same throughout. ui-window installs a view from outside and asserts it appears only once mounted" }
  - { id: S13, kind: decision, said: "the refusals are unit tests on mount() and on the vocabulary" }
touches:
  - packages/ui/src/vocabulary.ts
  - packages/ui/src/primitives.ts
  - packages/ui/src/frame/**
  - packages/ui/tests/scene.test.ts
  - packages/ui/tests/vocabulary.test.ts
  - packages/ui-conformance/src/**
  - packages/core/src/mount.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-plugins.test.ts
  - packages/cli/tests/ui-config.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "switching Work to a plugin's view changes the canvas and nothing else: every other region projects the same before and after", proof: "deferred:assertion:frame.a_section_view_changes_only_the_canvas", sources: [S3, S4, S12] }
  - { id: A2, statement: "clicking a record in a scene view opens the same record, with the same canvas, as clicking its row in the list", proof: "deferred:assertion:frame.a_scene_opens_what_the_list_opens", sources: [S7, S12] }
  - { id: A3, statement: "a view naming an action frame.yaml does not list is refused at boot, naming the view and the action", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S7, S13] }
  - { id: A4, statement: "ui.views naming a view nothing contributes is refused at boot, with the installed list", proof: "deferred:test:packages/cli/tests/ui-config.test.ts", sources: [S5, S6] }
  - { id: A5, statement: "a view on a renderer it does not hold falls back to the section's default and says so in the header", proof: "deferred:assertion:frame.a_view_falls_back_where_it_cannot_be_drawn", sources: [S8] }
  - { id: A6, statement: "an escalated record's sprite shows its attention frame with no ui block at all", proof: "deferred:test:packages/ui/tests/scene.test.ts", sources: [S10, S11] }
  - { id: A7, statement: "Scene, Place and Sprite refuse a property they do not declare and a sprite frame that is not a standing", proof: "deferred:test:packages/ui/tests/vocabulary.test.ts", sources: [S9, S10, S13] }
  - { id: A8, statement: "a view installed with amy plugin add from outside the workspace appears only once mounted", proof: "deferred:assertion:window.a_section_view_from_outside_appears_only_when_mounted", sources: [S1, S2, S12] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A3, A8" }
  - { mechanism: config, answer: works, proof: "deferred:A4" }
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A5, A7" }
guarantee:
  - { holds: "a view sends the same intents a list row sends, so it is never a road to a write the list does not have", not_against: "a plugin whose view names an action frame.yaml does not list" }
cut:
  - "a view replacing the whole window, as a herdr layout does: refused, the frame stays closed (S3)"
exit: "an outside plugin's office view of Work, installed with amy plugin add: the desktop app switches to it, the escalated record's worker stands out, a click opens it; the terminal shows the list and why; nothing outside the canvas moved"
---
# A section can be seen another way

`Work` is a list, the right default, but some people would rather see the same work as a board, a dashboard of time per state, or an office of desks, and no plugin can offer that today.
