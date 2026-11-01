---
sources:
  - { id: S1, kind: reference, ref: "plans/amy-has-a-window.md", said: "it ships a window nobody can extend; a window any plugin can rearrange is unrecognisable after the third install, so the frame is fixed and the places a plugin can put something are named" }
  - { id: S2, kind: reference, ref: "docs/concepts/plugins.md", said: "registry.contribute(collection, name, impl) is how a plugin adds to what another reads, and mount() refuses a collision by name; the window is six new collections, not a new plugin model" }
  - { id: S3, kind: decision, said: "ui-nav: a section in nav 1, after the three that ship; the same name refused" }
  - { id: S4, kind: decision, said: "ui-tab: a tab in a record's canvas for the workflows and states it names; a state the workflow lacks is refused by name, read from its diagram, else its declared states; same name refused" }
  - { id: S5, kind: decision, said: "ui-panel: an entry in the right panel's rail, with a home view, a view for the open record, or both; the same name refused" }
  - { id: S6, kind: decision, said: "ui-action: an entry in a row's ⋯; the same name refused" }
  - { id: S7, kind: decision, said: "ui-decoration: a badge on a row in nav 2; several allowed, ordered" }
  - { id: S8, kind: reference, ref: "plans/amy-lives-in-the-menu-bar.md", said: "ui-menubar: a line in the menu bar, under the work; the same name refused" }
  - { id: S9, kind: decision, said: "each contribution is a view (a view is data) plus the slice of the snapshot it reads, so the host recomputes it only when that slice moves" }
  - { id: S10, kind: reference, ref: "https://developers.google.com/workspace/add-ons/concepts/homepages", said: "Gmail add-ons open beside the mail: a rail of icons picks one; each has a homepage shown whatever is open, and contextual cards for the open thread, dropped on leaving; it never touches the mail" }
  - { id: S11, kind: decision, said: "the rail is a strip at the window's right edge, visible while the panel is closed: one entry per ui-panel after log and thread; choosing an entry opens the panel on it, choosing the open one closes it" }
  - { id: S12, kind: decision, said: "a rail entry names an icon from a closed set and a label; the terminal draws the label's first letter" }
  - { id: S13, kind: decision, said: "home is the view an entry shows with no record open (a notebook, a calendar, the tickets waiting in the tracker); it reads the snapshot and no record" }
  - { id: S14, kind: decision, said: "record is the view for the open record, declared for workflows and states like a ui-tab; an entry without home is hidden from the rail on other records; opening another record swaps the view, keeping the entry chosen" }
  - { id: S15, kind: decision, said: "an entry declares at least one of the two; log and thread ship as record views, so the window looks as amy-has-a-window draws it until a plugin adds an entry" }
  - { id: S16, kind: decision, said: "frame.yaml gains the rail region (place: right, spans: full-height, holds: [panel-entry]), the panel opening between canvas and rail, and slot panel.rail: { fixed: [log, thread], extended-by: ui-panel } replacing panel" }
  - { id: S17, kind: decision, said: "frame.yaml gains actions panel.next and panel.prev on ]p and [p; a click on an entry is panel.select; an edit to a locked file plus sf lock, in this row's pull request" }
  - { id: S18, kind: decision, said: "a ui-action declares what it writes, as a workflow declares trackerWrites and codeHostWrites; one reaching a mutating port unclaimed is refused at boot naming action and capability: never a second road to a write" }
  - { id: S19, kind: decision, said: "the three sections that ship (Work, Workflows, Settings) cannot be replaced or removed, only reordered; a plugin wanting a whole page adds a section, it does not take Work over" }
  - { id: S20, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "the conformance world already mounts one plugin contributing to every collection; ui-frame asserts where each lands, ui-window that it arrives from an install, and the refusals are mount() unit tests" }
  - { id: S21, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers the actions domain (listActions, runAction) and plugin contributions in listViews, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - packages/ui/frame.yaml
  - packages/ui/src/**
  - plugins/ui-*/src/**
  - packages/ui-conformance/src/**
  - packages/core/src/mount.ts
  - packages/server/src/**
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - packages/cli/tests/ui-plugins.test.ts
  - packages/core/tests/mount.test.ts
  - .software-factory/locks/**
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S21] }
  - { id: A2, statement: "a contribution lands only in the slot frame.yaml declares for its collection, in every renderer", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S1, S7, S16, S20] }
  - { id: A3, statement: "plugin sections come after Work, Workflows and Settings, whatever order they mounted in", proof: "deferred:assertion:frame.the_fixed_sections_come_first", sources: [S3, S19] }
  - { id: A4, statement: "a canvas tab declared for one workflow appears on no other workflow's records", proof: "deferred:assertion:window.a_tab_appears_only_where_it_is_declared", sources: [S4] }
  - { id: A5, statement: "with no plugin mounted, the rail holds log and thread and the window projects as it did before this row", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S15, S16] }
  - { id: A6, statement: "a panel entry with only a home view shows it with no record open, and keeps showing it when a record opens", proof: "deferred:assertion:window.a_panel_home_needs_no_record", sources: [S10, S13] }
  - { id: A7, statement: "a panel entry's record view follows the open record, and an entry declared for one workflow is not on the rail for another's records", proof: "deferred:assertion:window.a_panel_follows_the_open_record", sources: [S10, S14] }
  - { id: A8, statement: "a panel entry that declares neither view, or a state its workflow does not draw, is refused at boot by name", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S4, S15] }
  - { id: A9, statement: "]p and [p walk the rail and a click on an entry opens it, in every renderer", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S11, S12, S17] }
  - { id: A10, statement: "two plugins contributing the same name are refused at boot, naming both", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S2, S3, S5, S6, S8] }
  - { id: A11, statement: "a ui-action reaching a mutation it did not claim is refused at boot", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S18] }
  - { id: A12, statement: "a contribution replacing Work, Workflows or Settings is refused", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S19] }
  - { id: A13, statement: "a view reading only the budget is not recomputed when a record moves", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S9] }
  - { id: A14, statement: "a plugin installed with amy plugin add from outside the workspace appears only once mounted", proof: "deferred:assertion:window.a_plugin_from_outside_appears_only_when_mounted", sources: [S1, S20] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A10, A11" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A9" }
guarantee:
  - { holds: "the window is never a second road to a write the config did not allow", not_against: "a ui-action that claims the capability it uses" }
cut:
  - "a whole new way of seeing a section (a board, an office) as a panel: refused; that is plans/a-section-can-be-seen-another-way.md"
  - "a plugin replacing or removing Work, Workflows or Settings: refused; it adds a section instead"
exit: "via amy plugin add, an outside plugin's nav 1 section, canvas tab, ⋯ action and home-and-record rail entry appear only once mounted, land alike in the desktop app and text renderer, and the record view follows the open record"
---
# The window takes plugins

The window ships with nobody able to extend it, yet a window any plugin can rearrange is unrecognisable after the third install. So the frame stays fixed and the places a plugin can put something are named.
