---
sources:
  - { id: S1, kind: friction, said: "2026-11-10: amy has to work on the latest Node versions; this machine still runs it on v22 (nvm v22.22.1)" }
  - { id: S2, kind: reference, ref: "https://nodejs.org/dist/index.json", said: "on 2026-11-10 the newest LTS is v26.13.0 (Lithium, 2026-10-28) and v27 is only an alpha" }
  - { id: S3, kind: code, ref: "packages/cli/package.json", said: "engines.node is >=22.18.0: a floor, the one Node that runs TypeScript unbuilt, and nothing above it is ever tried" }
  - { id: S4, kind: code, ref: ".github/workflows/software-factory.yml", said: "every job sets node-version: 24, and so does release.yml; no job runs 26" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", symbol: "loopSpecFor", said: "the supervised loop's unit names process.execPath, the node that wrote it; under nvm that path carries the version, so a newer node leaves the loop on the old one" }
  - { id: S6, kind: code, ref: "plugins/file-brief-store/package.json", said: "fs-ext ^2.1.1 is a native addon built by node-gyp at install; npm 11 already warns that its install script is not covered by allowScripts, and the brief store imports flock from it" }
  - { id: S7, kind: discussion, said: "2026-11-10: fs-ext 2.1.1 built and loaded on Node v25.8.1 on this machine, so the addon is not what holds amy at 22 today" }
  - { id: S8, kind: decision, said: "the gate runs on the oldest Node amy supports and on the newest LTS, and the floor moves only by a plan. Proposed 2026-11-10" }
touches:
  - .github/workflows/software-factory.yml
  - .github/workflows/release.yml
  - packages/cli/package.json
  - packages/cli/src/index.ts
  - packages/cli/tests/supervisor.test.ts
  - plugins/file-brief-store/package.json
  - package.json
  - docs/start/install.md
criteria:
  - { id: A1, statement: "the gate runs on Node 22.18, 24 and 26, and is green on all three", proof: "deferred:unspecified:the software-factory workflow's matrix, read on the pull request", sources: [S1, S2, S3, S4, S8] }
  - { id: A2, statement: "a supervised loop started under one node and restarted after the person moved to another node runs on the node amy now runs under, or amy doctor names the stale path", proof: "deferred:test:packages/cli/tests/supervisor.test.ts", sources: [S5] }
  - { id: A3, statement: "a clean npm install of @amykit/cli and of the brief store on Node 26 with npm's install scripts gated still mounts the brief store, or the native addon is gone", proof: "deferred:unspecified:the bare-install scenario run on Node 26", sources: [S6, S7] }
  - { id: A4, statement: "the install guide names the Node versions amy is gated on", proof: "deferred:unspecified:docs/start/install.md read on the pull request", sources: [S3, S8] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:unspecified:the bare-install scenario run on Node 26" }
  - { mechanism: engines, answer: works, proof: "deferred:test:packages/cli/tests/supervisor.test.ts" }
  - { mechanism: agent-replies, answer: n/a, why: "no agent reply is read" }
guarantee:
  - { holds: "amy installs and passes its gate on every Node it says it supports", not_against: "a Node released after the last gate run" }
failures:
  - { step: install, when: "the native addon does not build on a new Node", goes_to: "a red bare-install scenario on that Node, naming fs-ext" }
cut:
  - "dropping Node 22 support: a separate plan, once nothing needs the floor"
  - "Bun or Deno: not asked"
exit: "amy installs and passes its gate on the newest Node LTS (26) and the current line, the supervised loop follows the node amy runs under, and this machine runs amy on 26"
---
# amy runs on the current Node

amy's floor is Node 22.18, the first that runs TypeScript unbuilt, and CI
runs 24. Nothing tries the newest LTS, and the machine that drives amy every
day is still on 22 because the supervised loop remembers the absolute path of
the node that installed it. This plan gates amy on the Node versions it
claims, and makes moving to a newer one a non-event.
