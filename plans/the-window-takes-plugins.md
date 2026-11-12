---
base: 1471c13ea5a21e998b417b336683844b0932092f
sources:
  - { id: S1, kind: friction, said: "the window ships with nobody able to extend it, yet a window any plugin can rearrange is unrecognisable after the third install; so the frame is fixed and the places a plugin can fill are named" }
  - { id: S2, kind: reference, ref: "docs/concepts/plugins.md", said: "registry.contribute(collection, name, impl) is how a plugin adds to what another reads, and mount() refuses a collision by name; the window is collections, not a new plugin model" }
  - { id: S3, kind: decision, said: "every node is a view: its header is the state, its body is what a plugin fills, with buttons, links and inputs, within a size limit per node. Decided 2026-11-12" }
  - { id: S4, kind: decision, said: "one plugin can fill many nodes generically, or one node alone, as a richer code diff would. Decided 2026-11-12" }
  - { id: S5, kind: decision, said: "ui-node fills a node's body for the workflows and states it names, or every state; the most specific wins (workflow and state, then state, then every state) and two at one level are refused naming both. Proposed 2026-11-12" }
  - { id: S6, kind: decision, said: "a node's body is the frame's node surface: at most 8 rows by 36 cells, 280 by 180 px, and 40 elements; past it, the default body shows with a badge naming the plugin. Proposed 2026-11-12" }
  - { id: S7, kind: decision, said: "ui-sidebar fills the sidebar for the states it names, with the same specificity; it is given the visit chosen, so one view draws the current state and a past one. Decided 2026-11-12" }
  - { id: S8, kind: decision, said: "the UI and the metadata it needs are both a plugin's: a ui-node or ui-sidebar declares the slice of the record and the event fields it reads, and is recomputed only when they move. Decided 2026-11-12" }
  - { id: S9, kind: reference, ref: "https://developers.google.com/workspace/add-ons/concepts/homepages", said: "Gmail add-ons have a homepage shown whatever is open, and contextual cards for the open thread" }
  - { id: S10, kind: decision, said: "ui-corner adds an icon to the top corner after the core's (what needs you, sidebar, settings), opening a floating window with its home view; the same name refused. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "ui-action adds an entry to a node's ⋯ and declares what it writes, as a workflow declares trackerWrites and codeHostWrites; one reaching a mutating port unclaimed is refused at boot" }
  - { id: S12, kind: decision, said: "ui-menubar adds rows to the menu bar beneath the core's; it never changes the title. Decided 2026-11-12" }
  - { id: S13, kind: decision, said: "the server sends how the UI is built, so a plugin added or removed appears or leaves in an open app on the next patch, with no rebuild and no restart. Decided 2026-11-12" }
  - { id: S14, kind: decision, said: "the app keeps the views it drew, to open fast next time, keyed by the server's instance, its contract hash and a digest of the mounted plugin set; a different key drops them before drawing. Decided 2026-11-12" }
  - { id: S15, kind: reference, ref: "docs/design/a-view-is-data.md", said: "a plugin does not render: it describes in a closed vocabulary and the renderer draws, so a phone never installs a package" }
  - { id: S16, kind: reference, ref: "plans/a-page-is-drawn-only-where-it-can-be.md", said: "a contribution may declare the surfaces it draws; elsewhere the default shows and says why" }
  - { id: S17, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "the conformance world mounts one plugin contributing to every collection; ui-frame asserts where each lands, ui-window that it arrives from an install, and the refusals are mount() unit tests" }
  - { id: S18, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers the actions domain (listActions, runAction) and plugin contributions in listViews, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - packages/ui/frame.yaml
  - packages/ui/conformance/golden.json
  - packages/ui/src/frame/frame.ts
  - packages/ui/tests/frame.test.ts
  - packages/ui/tests/node.property.test.ts
  - packages/ui-conformance/src/world.ts
  - packages/ui-conformance/src/checks.ts
  - packages/core/src/mount.ts
  - packages/core/tests/mount.test.ts
  - packages/core/tests/mount.property.test.ts
  - packages/services/surface.yaml
  - packages/services/src/domains/views.ts
  - packages/services/tests/surface.test.ts
  - packages/sdk/src/cache.ts
  - packages/sdk/tests/cache.property.test.ts
  - packages/cli/tests/ui-plugins.test.ts
  - .software-factory/locks/generated.lock.json
  - packages/sdk/package.json
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S18] }
  - { id: A2, statement: "a contribution lands only in the place frame.yaml names for its collection, in every renderer", proof: "deferred:assertion:frame.a_slot_takes_only_what_it_declares", sources: [S1, S2, S16, S17] }
  - { id: A3, statement: "for any set of ui-node and ui-sidebar contributions, each state gets the most specific one, and two at one level are refused naming both", proof: "deferred:property:packages/core/tests/mount.property.test.ts#generic_beats_specific", sources: [S4, S5, S7] }
  - { id: A4, statement: "for any body tree, one within the node surface's rows, size and element count is drawn, and one past any limit shows the default body with a badge naming its plugin", proof: "deferred:property:packages/ui/tests/node.property.test.ts#element_count_unchecked", sources: [S3, S6] }
  - { id: A5, statement: "a ui-sidebar view given a past visit draws it from that visit's slice, and the same view draws the current one", proof: "deferred:assertion:window.a_sidebar_draws_any_visit", sources: [S7] }
  - { id: A6, statement: "a view reading only a record's state is not recomputed when only the budget moves, nor one reading the budget when a record moves", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S8] }
  - { id: A7, statement: "a corner icon opens its home view whatever is chosen, after the core's icons, which no plugin removes or reorders", proof: "deferred:assertion:frame.the_core_icons_come_first", sources: [S9, S10] }
  - { id: A8, statement: "a ui-action reaching a mutation it did not claim is refused at boot", proof: "deferred:test:packages/cli/tests/ui-plugins.test.ts", sources: [S11] }
  - { id: A9, statement: "menu bar rows from plugins come beneath the core's, and the title is the same with and without them", proof: "deferred:assertion:window.the_menu_bar_title_is_the_cores", sources: [S12] }
  - { id: A10, statement: "two plugins contributing one name to one collection are refused at boot, naming both", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S2, S10, S12] }
  - { id: A11, statement: "with the app open, a plugin installed with amy plugin add appears on the next patch, and removed it leaves, with no rebuild or restart", proof: "deferred:assertion:window.a_plugin_comes_and_goes_live", sources: [S13, S15] }
  - { id: A12, statement: "for any two plugin sets, the cache key is equal exactly when the sets are, whatever order they mounted in; a different key draws nothing cached", proof: "deferred:property:packages/sdk/tests/cache.property.test.ts#a_removed_plugin_keeps_the_key", sources: [S14] }
  - { id: A13, statement: "the app opened a second time draws its cached views before the server answers, then the live patch replaces them", proof: "deferred:assertion:window.a_second_open_draws_the_cache_first", sources: [S14] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A3, A8, A10" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A4, A11" }
guarantee:
  - { holds: "the window is never a second road to a write the config did not allow", not_against: "a ui-action that claims the capability it uses" }
  - { holds: "nothing cached is drawn under another plugin set", not_against: "a plugin whose views change without its digest, which only a reinstall shows" }
failures:
  - { step: draw, when: "a node body is past the node surface", goes_to: "the default body, with a badge naming the plugin" }
cut:
  - "a plugin replacing the breadcrumb, the canvas's place, or a core corner icon: refused; the frame is the core's"
  - "a plugin shipping a frame.yaml of its own: refused"
  - "a whole other way of seeing the canvas (a board, an office): the-canvas-can-be-seen-another-way"
  - "React Server Components: refused; views are data the server sends (S15)"
exit: "with the app open, amy plugin add puts a fixture's node body, sidebar view and corner icon in place; amy remove takes them away live; the next open draws from the cache only when the set is unchanged"
---
# The window takes plugins

The frame stays fixed and the places a plugin can fill are named: a node's
body, a state's sidebar, a corner icon, a node's ⋯, a menu bar row. The
server sends them, so plugins come and go live, and the app's cache follows
the mounted set.
