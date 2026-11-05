---
base: 330ec3de00869241d24025edbd3b6a6eb5184f53
sources:
  - { id: S1, kind: decision, said: "plugins are classified so a person knows what each one is, and a page or the setup can group them: a closed set of kinds, never free text. Decided 2026-11-05" }
  - { id: S2, kind: decision, said: "a kind is declared once, in the package's package.json under amy.kinds; nothing on definePlugin repeats it. Decided 2026-11-05" }
  - { id: S3, kind: code, ref: "packages/core/src/plugin.ts", symbol: "Registry", said: "the registry takes queue, store, engine, workflow, a port by a string kind, an action and a named collection; nothing says what a package is" }
  - { id: S4, kind: code, ref: "plugins/ui-stub/package.json", said: "the only amy field in any manifest is ui-stub's conformance entry; no manifest has keywords" }
  - { id: S5, kind: code, ref: "scripts/docs/sources/packages.ts", said: "the docs probe tells a package only plugin from workflow, and records the ports it mounts and the collections it contributes to" }
  - { id: S6, kind: decision, said: "kinds: harness, agent, conversation, notifier, tracker, code-host, gate, workspace, runtime, workflow, ui-renderer, tool; each is what a shipped package registers today" }
  - { id: S7, kind: decision, said: "ui-extension and decider join the set with the row that ships the first package of that kind, not before: a kind nothing has is a promise" }
  - { id: S8, kind: decision, said: "a list, because a package can be two things (linear mounts tracker and feature, file-worktree workspace and worktree); its first entry is the primary, the one it is grouped under" }
  - { id: S9, kind: decision, said: "tracker covers every source of work: linear, next-steps, file-tasks, file-notes and feature-grooming's grooming source" }
  - { id: S10, kind: decision, said: "each kind names what the probe must see: harness contributes harness, conversation mounts conversation, runtime mounts a queue, store, engine or brief, tool registers an action" }
  - { id: S11, kind: decision, said: "the loader refuses a package whose amy.kinds names a value outside the set, at mount, naming the package and the value" }
  - { id: S12, kind: decision, said: "the docs reference groups plugins by primary kind, and the docs check fails when a declared kind has none of the registrations S10 names for it" }
  - { id: S13, kind: decision, said: "every plugin and workflow package this repository ships declares its kinds; libraries (core, cli, agent-kit, ui, file-log, the testkit) declare none" }
touches:
  - packages/core/src/plugin-kind.ts
  - packages/core/src/index.ts
  - packages/core/tests/plugin-kind.test.ts
  - packages/cli/src/loader.ts
  - packages/cli/tests/loader.test.ts
  - scripts/docs/sources/packages.ts
  - scripts/docs/blocks.ts
  - scripts/docs/tests/packages.test.ts
  - docs/reference/plugins.md
  - docs/concepts/plugins.md
  - plugins/*/package.json
  - packages/workflow-*/package.json
criteria:
  - { id: A1, statement: "PluginKind is a closed union exported from the core, holding exactly the twelve kinds, with a sentence per kind", proof: "deferred:test:packages/core/tests/plugin-kind.test.ts", sources: [S1, S3, S6, S7] }
  - { id: A2, statement: "a package whose amy.kinds names a value outside the set is refused at mount, naming the package and the value", proof: "deferred:test:packages/cli/tests/loader.test.ts", sources: [S2, S11] }
  - { id: A3, statement: "for any declared list, the primary is its first entry and the docs group the package under it alone", proof: "deferred:property:scripts/docs/tests/packages.test.ts#primary_is_not_first", sources: [S8, S12] }
  - { id: A4, statement: "a package declaring conversation without mounting a conversation port fails the docs check, naming both", proof: "deferred:test:scripts/docs/tests/packages.test.ts", sources: [S5, S10, S12] }
  - { id: A5, statement: "every shipped plugin and workflow manifest has amy.kinds and every library has none, and the docs check is green on it", proof: "deferred:test:scripts/docs/tests/packages.test.ts", sources: [S4, S9, S13] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:A2; the loader reads amy.kinds from the manifest it already reads" }
  - { mechanism: rendering, answer: n/a, why: "ui-stub's manifest only gains amy.kinds beside its conformance entry; nothing it draws changes" }
  - { mechanism: mount-and-capabilities, answer: n/a, why: "a kind is read from the manifest and checked against the set; what a plugin may mount or write is unchanged" }
guarantee:
  - { holds: "a kind is written in one place, the manifest, and every reader takes it from there", not_against: "a third-party package that declares no kinds, which is accepted and listed ungrouped" }
  - { holds: "a declared kind the package does not register fails this repository's docs check", not_against: "a third-party package, whose registrations this repository never probes" }
failures:
  - { step: mount, when: "amy.kinds is not an array of strings", goes_to: "refused at mount, naming the package" }
cut:
  - "a kinds member on definePlugin: refused, it would say the same thing twice (S2)"
  - "free-text categories or keywords as kinds: refused (S1)"
exit: "amy's plugin reference lists every shipped package under one of twelve kinds read from its package.json, and a package claiming a kind it does not register turns the docs check red naming it"
---
# A plugin says what it is

Every plugin is a name in a list. One field in the manifest, from a closed set,
says whether it is a harness, a conversation, a tracker or a workflow.
