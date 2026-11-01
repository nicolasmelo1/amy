---
sources:
  - { id: S1, kind: reference, ref: "plans/amy-lives-in-the-menu-bar.md", said: "gave every record a standing — attention, active, waiting, finished — from the states a workflow's diagram marks attention" }
  - { id: S2, kind: decision, said: "the window colours by standing, so a workflow nobody configured still reads correctly" }
  - { id: S3, kind: decision, said: "config.yaml's ui block decides the rest: theme (shipped or plugin-contributed), colors overriding any theme token, states overriding one workflow's state, e.g. ticket-to-qa HUMAN_REVIEW" }
  - { id: S4, kind: decision, said: "a theme is a set of tokens — colours, font, density — contributed to a ui-theme collection, so a plugin can ship one" }
  - { id: S5, kind: decision, said: "ui keys are validated at boot like any setting: a state the workflow's diagram does not draw, or a token no theme defines, is refused by name" }
  - { id: S6, kind: reference, ref: "plans/amy-has-a-window.md", said: "in the desktop app the tokens reach a workflow's diagram as Pele's --pele-* CSS variables, so a theme recolours it with the rest of the window" }
  - { id: S7, kind: decision, said: "the classDef styles in a workflow.mmd are not read: they are how the file looks on GitHub and Obsidian; the window's colours come from the theme and the ui block" }
  - { id: S8, kind: reference, ref: "docs/design/the-frame-is-closed.md", said: "colour is the one thing the frame does not fix, so no renderer decides it; a-renderer-names-no-colour keeps every colour in a theme's tokens" }
  - { id: S9, kind: decision, said: "the projection carries each row's standing, never its colour, so 'the escalated records stand out' is asserted the same in a terminal and the desktop app" }
touches:
  - packages/cli/src/config.ts
  - packages/cli/tests/ui-theme.test.ts
  - packages/ui/src/**
criteria:
  - { id: A1, statement: "an escalated record's row carries the attention standing in every renderer, with no ui block at all", proof: "deferred:assertion:frame.renderers_agree_on_every_region", sources: [S1, S2, S9] }
  - { id: A2, statement: "a colour set for one state of one workflow applies there and nowhere else", proof: "deferred:test:packages/cli/tests/ui-theme.test.ts", sources: [S3, S4, S6, S7] }
  - { id: A3, statement: "a state the workflow does not declare is refused at boot by name", proof: "deferred:test:packages/cli/tests/ui-theme.test.ts", sources: [S5] }
  - { id: A4, statement: "a colour literal in a renderer outside its token file fails the build", proof: "deferred:test:mutation fixture for a-renderer-names-no-colour", sources: [S8] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: rendering, answer: works, proof: "deferred:A1, A4" }
guarantee:
  - { holds: "a renderer never decides a colour; the projection carries standing, not colour", not_against: "a theme's tokens and the ui block, which are the person's" }
failures:
  - { step: boot, when: "ui names a state the diagram does not draw or a token no theme defines", goes_to: "refused by name" }
cut:
  - "reading classDef styles from workflow.mmd"
exit: "a person switches the window to a theme a plugin contributed, recolours one state of one workflow, and the escalated records are still the ones that stand out"
---
# Looks are configuration

The window draws each record's standing; what that looks like is a person's
preference, not the machine's.
