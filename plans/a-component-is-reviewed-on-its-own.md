---
sources:
  - { id: S1, kind: decision, said: "so the window does not turn into slop, amy has a design system: each component reviewed on its own, on the desktop, in the browser and in the terminal. Decided 2026-11-04" }
  - { id: S2, kind: decision, said: "no Storybook: amy's own, as simple as it can be to start, made more capable later. Decided 2026-11-04" }
  - { id: S3, kind: decision, said: "one command at the repository root opens the design system for every platform, or for the ones named: desktop, web, terminal. Decided 2026-11-04" }
  - { id: S4, kind: reference, ref: "packages/ui/src/vocabulary.ts", symbol: "VOCABULARY", said: "the closed set of primitives every renderer translates, and `catalogue()` lists them with their props; a component of the design system is one of these primitives, so there is no second list to keep" }
  - { id: S5, kind: reference, ref: "plans/looks-are-configuration.md", said: "a theme is a set of tokens — colours, font, density — and no renderer names a colour of its own" }
  - { id: S6, kind: reference, ref: "https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/", said: "the Design Tokens Community Group's 2025.10 format is a stable final report: JSON tokens with a name, a $value, a $type and aliases between them" }
  - { id: S7, kind: decision, said: "the tokens the shipped look uses are one file in that format, packages/ui/tokens.json; a theme plugin overrides tokens by name and adds none the file does not have" }
  - { id: S8, kind: decision, said: "each primitive has a file of examples beside the vocabulary, packages/ui/design/<Primitive>.tsx: named trees (empty, typical, long text, attention, narrow) built from the vocabulary alone, every one of them valid against it" }
  - { id: S9, kind: decision, said: "`npm run design` opens every platform; `npm run design -- terminal web` only those; `npm run design -- terminal Badge` one primitive" }
  - { id: S14, kind: decision, said: "the terminal draws each example through the text renderer, one after another; web serves one page of every example, drawn by the webview renderer; desktop opens that page in the desktop app" }
  - { id: S10, kind: decision, said: "a platform with no renderer built yet says so and names the plan that builds it, and the others still open; the command never fails silently over one missing platform" }
  - { id: S13, kind: reference, ref: "plans/amy-has-a-window.md", said: "the desktop app draws in a webview; the same webview renderer is what a browser opens, so web and desktop arrive together with that plan, and the text renderer is the only one that exists today" }
  - { id: S11, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "the frame fixes regions, order and keys, and is measured against a golden; pixels are not gated, because fonts and engines differ by machine" }
  - { id: S12, kind: decision, said: "the frame stays the core's, one file for every renderer: a plugin changes how a section is seen and how it looks, never where the regions are. Decided 2026-11-04" }
  - { id: S15, kind: decision, said: "a device too small for the window, a phone, gets a surface of its own in frame.yaml, owned by the core like the window and the menu bar. Decided 2026-11-04" }
  - { id: S16, kind: decision, said: "amy reads color, dimension, fontFamily, fontWeight, number and strokeStyle tokens, and an alias followed one level; a group, a composite $type, an alias to an alias or another $type is refused at load, naming the token. Decided 2026-11-08" }
  - { id: S17, kind: decision, said: "a theme's override must keep the token's $type; an override whose $type differs from the file's, or whose aliases form a cycle, is refused at load, naming the theme and the token. Decided 2026-11-08" }
  - { id: S18, kind: decision, said: "a word given to the design command that is neither a platform nor a primitive is refused, naming the platforms and the primitives it could have been; nothing opens. Decided 2026-11-08" }
touches:
  - packages/ui/tokens.json
  - packages/ui/design/**
  - packages/ui/src/**
  - packages/ui/tests/design.test.ts
  - scripts/design.ts
  - package.json
  - docs/development/the-design-system.md
criteria:
  - { id: A1, statement: "every primitive in the vocabulary has a file of examples, and every example is valid against the vocabulary", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S2, S4, S8] }
  - { id: A2, statement: "a primitive added to the vocabulary with no examples fails the build, naming it", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S1, S4] }
  - { id: A3, statement: "tokens.json is in the 2025.10 token format, and a token a renderer or theme names that the file does not define is refused by name", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S5, S6, S7] }
  - { id: A4, statement: "`npm run design -- terminal Badge` draws every Badge example through the text renderer and nothing else", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S3, S9, S14] }
  - { id: A6, statement: "the design command draws nothing outside the frame's surfaces and reads no frame but packages/ui/frame.yaml", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S11, S12, S15] }
  - { id: A5, statement: "with no webview renderer built, `npm run design` opens the terminal catalogue and says web and desktop arrive with amy-has-a-window, and exits zero", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S10, S13] }
  - { id: A7, statement: "a tokens file or theme holding a composite $type, a $type outside the read subset, or an alias to an alias is refused at load naming the token", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S6, S16] }
  - { id: A8, statement: "a theme override whose $type differs from the file's, or whose aliases form a cycle, is refused at load naming the theme and the token", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S7, S17] }
  - { id: A9, statement: "`npm run design -- terminal Bdage` opens nothing and names every platform and primitive", proof: "deferred:test:packages/ui/tests/design.test.ts", sources: [S9, S18] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A4" }
guarantee:
  - { holds: "every primitive a screen can hold has been looked at on its own, in every renderer that exists, through the same examples", not_against: "how it looks on a machine whose fonts differ; pixels are reviewed by a person, never gated" }
  - { holds: "a token is read only in the declared subset of the 2025.10 format, and a theme changes a token's value, never its type", not_against: "a token valid in the full format that amy does not read, which is refused rather than half-read" }
cut:
  - "the full 2025.10 format, groups and composite types included: refused until a look needs one (S16)"
  - "Storybook, or any other catalogue tool: refused; the vocabulary is closed and small, and the examples are data a renderer already draws"
  - "a lock recording which example a person approved on which platform: later, once there is more than one renderer to disagree"
  - "a plugin shipping a frame.yaml of its own: refused; the frame is the core's (S12)"
exit: "a person runs `npm run design -- terminal`, steps through every primitive's examples in the terminal one by one, and `npm run design` does the same while saying that web and desktop arrive with amy-has-a-window"
---
# A component is reviewed on its own

A window built screen by screen is reviewed screen by screen, and a primitive
that looks wrong in all of them gets noticed in none. Each primitive is looked
at on its own first, in every renderer, from the same examples.
