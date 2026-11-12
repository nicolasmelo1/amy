---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: friction, said: "2026-11-12: the shared vocabulary caps what a plugin can draw; a richer code diff needs HTML, which a terminal cannot draw" }
  - { id: S2, kind: decision, said: "a plugin may work on some platforms and not others; the core stays multi-platform as far as it can. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "diff and code open in the person's editor; a page is for what neither the vocabulary nor the editor shows. Decided 2026-11-12" }
  - { id: S4, kind: reference, ref: "docs/design/a-view-is-data.md", said: "a plugin describes in a closed vocabulary and the renderer draws, so a phone never installs a package and two Reacts never meet" }
  - { id: S5, kind: decision, said: "every window contribution may declare the surfaces it draws; on a surface it leaves out, the place shows its default and says which plugin and why. Proposed 2026-11-12" }
  - { id: S6, kind: decision, said: "a Page primitive carries a plugin's served page and a fallback Link; only a renderer declaring Page draws the page, every other one draws the link. Proposed 2026-11-12" }
  - { id: S7, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/packages/client/src/lib/isolated-page.ts", symbol: "PAGE_CSP", said: "a page runs in a frame sandboxed without allow-same-origin and a policy of default-src none, so it reads no cookie, storage or DOM of the app and reaches no network" }
  - { id: S8, kind: decision, said: "a page is drawn under that sandbox and policy, given its snapshot slice as JSON, and speaks to the window only in intents the vocabulary already validates. Proposed 2026-11-12" }
  - { id: S9, kind: decision, said: "the server serves a mounted plugin's pages, so a page comes and goes with its plugin and no app is rebuilt for one. Proposed 2026-11-12" }
touches:
  - packages/ui/src/vocabulary.ts
  - packages/ui/src/primitives.ts
  - packages/ui/src/frame/frame.ts
  - packages/ui/tests/vocabulary.test.ts
  - packages/ui/tests/page.property.test.ts
  - packages/core/src/mount.ts
  - packages/core/tests/mount.test.ts
  - packages/services/src/domains/views.ts
  - packages/services/tests/pages.test.ts
  - plugins/ui-webview/src/page.tsx
  - plugins/ui-webview/tests/page.test.ts
  - plugins/ui-ink/src/page.tsx
  - packages/ui-conformance/src/world.ts
  - .software-factory/policy.yaml
  - plugins/ui-webview/package.json
  - plugins/ui-ink/package.json
criteria:
  - { id: A1, statement: "a contribution declaring the window surface alone shows the place's default in the terminal, naming the plugin and the surface it lacks", proof: "deferred:assertion:frame.a_contribution_falls_back_where_it_cannot_be_drawn", sources: [S2, S5] }
  - { id: A2, statement: "a renderer that does not declare Page draws its fallback Link in every place, and a Page with no fallback is refused at mount, naming the plugin", proof: "deferred:test:packages/core/tests/mount.test.ts", sources: [S4, S6] }
  - { id: A3, statement: "a page's frame carries the sandbox without allow-same-origin and the default-src none policy, and a page that fetches, reads a cookie or posts a form reaches nothing", proof: "deferred:test:plugins/ui-webview/tests/page.test.ts", sources: [S7, S8] }
  - { id: A4, statement: "for any message a page posts, only a valid intent of the vocabulary reaches the server; every other message is dropped", proof: "deferred:property:packages/ui/tests/page.property.test.ts#a_closure_intent_passes", sources: [S8] }
  - { id: A5, statement: "a mounted plugin's page is served at its route, and gone the moment the plugin is removed, with the open app drawing the fallback", proof: "deferred:test:packages/services/tests/pages.test.ts", sources: [S9] }
  - { id: A6, statement: "a page in a node is held to the node surface's size, and one in the sidebar to the sidebar's", proof: "deferred:assertion:window.a_page_keeps_its_place", sources: [S6] }
  - { id: A7, statement: "the conformance world's page plugin draws in the desktop app and its link in the terminal, and the frame projects the same either way", proof: "deferred:assertion:frame.a_page_changes_only_its_place", sources: [S1, S3, S5, S6] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2" }
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A6, A7" }
guarantee:
  - { holds: "a page reads only what the window hands it and acts only through intents", not_against: "a page that misleads the person looking at it, which no sandbox judges" }
  - { holds: "every place still draws something on every renderer", not_against: "a fallback link that leads nowhere useful in a terminal" }
failures:
  - { step: draw, when: "a page fails to load or throws", goes_to: "its place shows the fallback link and names the plugin" }
cut:
  - "a page reaching the network, the server or the app's storage: refused (S7)"
  - "a page in the menu bar: refused; a native menu draws no frame"
  - "a full diff drawn as a page by default: refused; the editor shows it (S3)"
exit: "a fixture plugin's richer diff page draws in the desktop app's sidebar, sandboxed and offline, posts a poke that moves the record, and the terminal shows its link instead; removed, the app draws the link"
---
# A page is drawn only where it can be

The vocabulary keeps every plugin drawable everywhere, and caps what one can
show. A plugin may bring a page for renderers that draw pages, sandboxed and
offline, with a link everywhere else, so the core stays multi-platform and a
plugin need not.
