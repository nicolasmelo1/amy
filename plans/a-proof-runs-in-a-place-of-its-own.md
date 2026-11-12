---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: friction, said: "2026-11-12: proof resources are seats; at capacity one a second proof waits (`waiting for a seat on api, app`), so proofs run one at a time on the machine" }
  - { id: S2, kind: friction, said: "2026-11-12: a project's resource script boots its API and app on fixed ports 3001 and 3000 from one checkout under ~/.amy/prove, seeds one local database, and refuses when a port is taken, so it collides with the person's dev servers" }
  - { id: S4, kind: code, ref: "plugins/prove/src/resources.ts", symbol: "Resource", said: "a resource is capacity, up, check and down, run through the commands port; the proving plugin names no tool" }
  - { id: S5, kind: reference, ref: "plans/a-proof-runs-against-its-own-branch.md", said: "a resource's commands are handed the work's worktree and branch; two units on two branches lease two seats and boot two trees" }
  - { id: S6, kind: code, ref: "plugins/prove/tests/scenario.test.ts", said: "a scenario's steps name fixed addresses, as browser.open on https://web.localhost/invoices/2" }
  - { id: S7, kind: reference, ref: "https://github.com/microsandbox/microsandbox", said: "microVMs from OCI images, beta, on macOS Apple Silicon, Linux with KVM and Windows with WHP, Apache-2.0; the SDK boots a VM as a child process, no daemon; outbound hosts allowlisted" }
  - { id: S8, kind: reference, ref: "https://cdn.jsdelivr.net/gh/superradcompany/microsandbox@main/sdk/node-ts/README.md", said: "the TypeScript SDK, microsandbox on npm, Node 22+: Sandbox.builder(name).image().cpus().memory().create(), exec, .port(8080, 80) and named volumes; no example binds a host directory" }
  - { id: S9, kind: decision, said: "isolation matters most while proving; a microVM place is a plugin like any other, configured by whoever mounts it. Decided 2026-11-12" }
  - { id: S10, kind: decision, said: "a resource may name ports; each run gets free host ports for them and a run id, handed to up, check and down as arguments, so runs share a machine without a VM. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "a scenario step names a resource's port as ${resource.port}, so the browser reaches the run's own app. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "places are a collection the proving plugin reads; microsandbox contributes one that runs a resource's commands in a microVM per run; the harness and its login stay on the host. Proposed 2026-11-12" }
touches:
  - plugins/prove/src/resources.ts
  - plugins/prove/src/places.ts
  - plugins/prove/src/steps.ts
  - plugins/prove/src/scenario.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/src/index.ts
  - plugins/prove/tests/resources.test.ts
  - plugins/prove/tests/places.test.ts
  - plugins/prove/tests/places.property.test.ts
  - plugins/prove/tests/scenario.test.ts
  - plugins/prove/README.md
  - plugins/microsandbox/package.json
  - plugins/microsandbox/tsconfig.json
  - plugins/microsandbox/README.md
  - plugins/microsandbox/CHANGELOG.md
  - plugins/microsandbox/src/index.ts
  - plugins/microsandbox/src/plugin.ts
  - plugins/microsandbox/src/config.ts
  - plugins/microsandbox/src/MicrosandboxPlace.ts
  - plugins/microsandbox/tests/MicrosandboxPlace.test.ts
  - plugins/microsandbox/tests/plugin.test.ts
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - package-lock.json
  - registry/plugin-microsandbox.json
  - docs/reference/plugins.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/proof-places-scenario.sh
  - .software-factory/evidence/microsandbox-scenario.sh
criteria:
  - { id: A1, statement: "a resource naming the port `app` gives each run a free host port, never one already bound, and the same port to its up, check, down and steps", proof: "deferred:test:plugins/prove/tests/places.test.ts", sources: [S2, S10] }
  - { id: A2, statement: "for any runs up to a resource's capacity, no two hold the same port at once, and an ended run's ports are free again", proof: "deferred:property:plugins/prove/tests/places.property.test.ts#a_port_given_twice", sources: [S1, S10] }
  - { id: A3, statement: "a step input `${app.app}` reads the run's own port; a resource or port no resource declares is refused when the scenario is read, naming it", proof: "deferred:test:plugins/prove/tests/scenario.test.ts", sources: [S6, S11] }
  - { id: A4, statement: "every resource command gets the run id, so a script can name its database and directory by it", proof: "deferred:test:plugins/prove/tests/resources.test.ts", sources: [S2, S10] }
  - { id: A5, statement: "a resource naming no ports runs exactly the commands and arguments it ran before", proof: "deferred:test:plugins/prove/tests/resources.test.ts", sources: [S4] }
  - { id: A6, statement: "with port 3000 held by another process, a run of a resource naming a port comes up on a free one and its check passes", proof: "assertion:proof.a_taken_port_is_never_given", sources: [S2, S10] }
  - { id: A7, statement: "two proofs of two units on a resource of capacity two run at the same time on distinct ports and both end PROVEN", proof: "assertion:proof.two_proofs_run_side_by_side", sources: [S1, S5, S10] }
  - { id: A8, statement: "with the microsandbox place set for a resource, its up, check and down run in a microVM per run, from the configured image, with its ports published on the run's host ports", proof: "deferred:test:plugins/microsandbox/tests/MicrosandboxPlace.test.ts", sources: [S7, S8, S12] }
  - { id: A9, statement: "the work's worktree reaches the microVM; whether the SDK binds a host directory or the files are copied in is what the work finds first", proof: "unspecified:the TypeScript SDK shows no host bind; the first thing the work finds", sources: [S5, S8] }
  - { id: A10, statement: "a microVM gets the worktree, the configured environment names and allowlisted hosts, and no harness credential", proof: "deferred:test:plugins/microsandbox/tests/MicrosandboxPlace.test.ts", sources: [S7, S12] }
  - { id: A11, statement: "the microsandbox plugin is refused at mount where the machine has no Apple Silicon, KVM or WHP, naming what is missing, and amy doctor says the same", proof: "deferred:test:plugins/microsandbox/tests/plugin.test.ts", sources: [S7, S9] }
  - { id: A12, statement: "on Apple Silicon, two runs each bind port 3000 inside their own microVM, published on two host ports, and both checks pass", proof: "assertion:microsandbox.two_vms_bind_the_same_port", sources: [S7, S8, S12] }
crosses:
  - { mechanism: checkouts-and-leases, answer: n/a, why: "a run still holds a seat per resource and capacity alone says how many run at once; the worktree it is handed is the previous plan's" }
  - { mechanism: install-and-update, answer: n/a, why: "microsandbox is installed with amy add like any plugin; nothing installs it by default" }
guarantee:
  - { holds: "two proofs whose resources name ports never get the same host port, and never one another process holds", not_against: "a resource script that ignores the port it is handed and binds a fixed one" }
  - { holds: "nothing in a microVM can read a harness's login", not_against: "a secret a person names in the place's environment" }
failures:
  - { step: allocate, when: "no free port is left in the configured range", goes_to: "the run waits for a seat as when capacity is spent" }
  - { step: microVM, when: "the image cannot be pulled or the VM does not boot", goes_to: "the resource did not come up, naming the place and its error; the run ends refused" }
cut:
  - "the agent's own run in a microVM: the harness and its login stay on the host"
  - "a microVM per state other than proving: once proofs show it holds"
  - "TBO-1391's two refused proofs, no reload operation and a recorder falling behind, were tool gaps isolation would not fix: the proof plans' business"
exit: "with port 3000 taken by a dev server, two tickets' proofs on a resource of capacity two run at once on their own ports and run ids and both end PROVEN; with microsandbox mounted, each runs in its own microVM"
---
# A proof runs in a place of its own

A proof's resources boot on fixed ports, from one checkout, against one
database. So two proofs never run at once, and a proof clashes with the
person's own dev servers. This plan gives each run its own ports and run id
on the host, with no new dependency, and adds microsandbox as an optional
place that runs a resource in a microVM of its own.
