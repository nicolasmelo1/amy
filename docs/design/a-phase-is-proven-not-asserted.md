---
base: 5ffcd87cd6caf2bdd3dde019433f9e2c77f01eb5
sources:
  - { id: S1, kind: reference, ref: "docs/design/a-project-is-three-phases.md", said: "asks for the slot; this plan is what goes in the third, the phase that exists nowhere in amy today" }
  - { id: S2, kind: decision, said: "a workflow's walkthrough drives the lifecycle against a fake world in milliseconds: right for a state machine, silent on whether the produced work holds" }
  - { id: S3, kind: friction, said: "a batch insert and two batch updates, 26 unit tests mocking the driver, all green, asserted only statement text; the real server rejected all three on the first row; preparing each against it found them in one command" }
  - { id: S4, kind: friction, said: "one failed because a VALUES parameter has no column to type it and reads as text; two because an UPDATE target cannot be referenced from a JOIN" }
  - { id: S5, kind: friction, said: "a plan named three user-visible outcomes and no example; partial payment plus credit — systems agree, badge says not — was found by a reviewer after the code was written" }
  - { id: S6, kind: decision, said: "passing the tests a branch can run is not evidence the work holds" }
  - { id: S7, kind: decision, said: "a phase is complete when a named scenario exists, a real cheap agent completes the flow from a customer-shaped prompt against the real local system, every required assertion is passed and none unsupported" }
  - { id: S8, kind: decision, said: "and the run leaves a redacted artifact attached as evidence; unit, integration or scripted tests passing is not completion" }
  - { id: S9, kind: decision, said: "a link to the common document is not a substitute for the phase's own scenario: each phase names its own, cited rather than gestured at" }
  - { id: S10, kind: decision, said: "unsupported is a state of its own: an assertion the harness could not evaluate is the thing most often counted as success" }
  - { id: S11, kind: decision, said: "2026-10-01: the proof is a project artifact, not an execution state — one record per unit beside the briefs in the artifact root, written by prove/, read by the others" }
  - { id: S12, kind: reference, ref: "docs/design/a-project-is-brief-work-and-proof.md", said: "the phases are calls of one project workflow: no phase reaches into another's lifecycle, and the proof is handed the criteria the brief returned" }
  - { id: S13, kind: decision, said: "a proof can be manual: the record makes it one, not who ran it; it names the scenario, each assertion's status, who ran it and what it ran against" }
  - { id: S14, kind: decision, said: "a proof records the code digest and the brief revision it proved; when either moves it stops counting and the unit is unproven, which does not count as done" }
  - { id: S16, kind: decision, said: "naming the proving scenario in planning forces an example, the cheapest instrument for the case a prose requirement left open, two phases before a reviewer" }
  - { id: S17, kind: decision, said: "proving is a plugin: the core learns no scenario, step, resource or driver. amy stays a state machine that moves work from one state to the next. Decided 2026-11-06" }
  - { id: S18, kind: decision, said: "what proves work differs by domain: development runs the application, marketing checks something was published, training a model checks a baseline was beaten, a call center checks the call was made. Decided 2026-11-06" }
  - { id: S19, kind: decision, said: "the scenario is a section of the brief, settled while grooming: steps that each call an operation by name with its input, the resources it needs, the fixtures it uses. Decided 2026-11-06" }
  - { id: S20, kind: reference, ref: "docs/design/a-workflow-calls-another.md", said: "a callee no mounted port satisfies is refused at boot with the full call path: the calls a workflow makes are fixed when it mounts, so a composition chosen per task cannot be one" }
  - { id: S21, kind: decision, said: "one proving workflow walks every scenario, its diagram the same for each: the scenario is its input, so a task needing a curl and one needing two apps and a person differ in data alone. Decided 2026-11-06" }
  - { id: S22, kind: decision, said: "a step is deterministic unless it says otherwise: one marked agent runs a harness, one marked human asks a person, wait-until repeats a check until it holds or a deadline passes. Decided 2026-11-06" }
  - { id: S23, kind: decision, said: "a fixture is shared across scenarios and ensures a state instead of performing an action: it reads the world first, acts only on what differs, and asks a person when it cannot. Decided 2026-11-06" }
  - { id: S24, kind: decision, said: "the work moves under the proof: two tickets in different phases may need one account at once. A resource has a capacity, a run leases it before its first step, and waits as a look when it cannot. Decided 2026-11-06" }
  - { id: S25, kind: decision, said: "the next lease goes by the work's priority, and a holder that stops renewing loses its lease. Decided 2026-11-06" }
  - { id: S26, kind: decision, said: "a lease is held while a human step waits; the conversation asks in the work's thread and the notifier tells the person where the proof stopped and what it waits on. Decided 2026-11-06" }
  - { id: S27, kind: decision, said: "nothing about an environment is assumed: containers, a Rails or a Clojure app; a resource is the commands its person configures to bring it up, check it and take it down. Decided 2026-11-06" }
  - { id: S28, kind: code, ref: "plugins/command/package.json", said: "the commands port: any command line tool, reached by a name the config allows" }
  - { id: S29, kind: reference, ref: "https://github.com/vercel-labs/portless", said: "gives each app a free port through PORT and a stable https://<name>.localhost, one subdomain per worktree branch; it starts no server itself, an agent runs portless run <cmd>" }
  - { id: S30, kind: decision, said: "each driver is a plugin of its own offering operations: a browser over agent-browser, a desktop over agent-desktop, a terminal over terminal-use; a scenario reaches a driver only through its operations. Decided 2026-11-06" }
  - { id: S31, kind: reference, ref: "https://agent-browser.dev/diffing", said: "diff snapshot compares the accessibility tree as text; diff screenshot compares pixels against a baseline image with a 0 to 1 threshold, and reports a size mismatch instead of comparing" }
  - { id: S32, kind: reference, ref: "https://agent-browser.dev/desktop", said: "agent-desktop reads macOS, Windows and Linux apps through their accessibility trees as JSON with refs, holds no agent, and opens a DevTools port agent-browser joins for an Electron app" }
  - { id: S33, kind: decision, said: "a UI check passes on structure first, the accessibility tree, then on pixels within a threshold against the planned design; what neither settles goes to an agent, and what it cannot settle is unsupported. Decided 2026-11-06" }
  - { id: S34, kind: decision, said: "an agent step that passes is kept as the operations it called; the next run replays them with no model, and the agent runs again only where the replay breaks. Decided 2026-11-06" }
  - { id: S35, kind: reference, ref: "https://github.com/flipbit03/terminal-use", said: "tu runs an interactive program in a session, types and presses keys, clicks on screen text, waits for a regex or a still screen, and answers in JSON when no terminal is attached" }
  - { id: S36, kind: code, ref: "packages/workflow-ticket-to-qa/src/plugin.ts", said: "declares its brief and prove phases absent with reasons, as the errand and note-to-plan do; no directory in the repository is a brief/ or prove/ phase, so no whole project exists to copy" }
  - { id: S37, kind: decision, said: "one example is a whole project, examples/a-whole-project/: brief/ calls feature-grooming, workflow/ calls ticket-to-qa, prove/ calls the proving plugin with a browser scenario. It ships with the proving plugin. Decided 2026-11-06" }
  - { id: S38, kind: reference, ref: "plans/the-examples-are-not-the-machine.md", said: "the shipped workflows move to examples/ under their same package names" }
  - { id: S39, kind: decision, said: "leases are the machine's, kept under Amy home and shared by every project and profile: one account is one resource however many projects reach it. Decided 2026-11-07" }
  - { id: S40, kind: code, ref: "packages/cli/src/profiles.ts", symbol: "artifactDirectory", said: "each project's artifact root is its own, so a lease kept there would be invisible to another project needing the same account" }
  - { id: S42, kind: decision, said: "feature-grooming mounts no port of its own: a workflow that registers ports is mounted, never called, and nothing read grooming-source or grooming-tracker; groomFeature stays for a caller that hands it a source and a tracker. Decided 2026-11-08" }
  - { id: S43, kind: decision, said: "a project's walk leaves BRIEF only once every phase's brief check is green, the proving phase's scenario included, not only the brief phase's own. Decided 2026-11-08" }
  - { id: S44, kind: decision, said: "the lease lock is recovered from a daemon that died holding it without ever removing a live replacement's lock, proven by processes racing on one stale lock. Decided 2026-11-08" }
  - { id: S41, kind: decision, said: "feature-grooming becomes a workflow a project's brief/ calls: a defineWorkflow declaring the brief's sections and check, returning the criteria it settled, and still mounting the ports it mounted. Decided 2026-11-08" }
touches:
  - plugins/prove/**
  - examples/a-whole-project/**
  - packages/workflow-feature-grooming/**
  - packages/cli/src/project.ts
  - packages/cli/tests/project.test.ts
  - plugins/agent-browser/**
  - plugins/agent-desktop/**
  - plugins/terminal/**
  - package.json
  - package-lock.json
  - tsconfig.json
  - docs/**
  - .changeset/**
untouched:
  - "packages/core/src/**: proving is a plugin, and the core learns no scenario, step, resource or driver (S17)"
criteria:
  - { id: A1, statement: "a brief whose scenario section is missing cannot leave grooming, and its check names the unit", proof: "test:plugins/prove/tests/scenario.test.ts", sources: [S5, S9, S16, S19, S43], done: true }
  - { id: A2, statement: "a scenario runs against the real system rather than the walkthrough's fake world, and a scenario whose only actor is the fake world is refused", proof: "test:plugins/prove/tests/scenario.test.ts", sources: [S1, S2, S3, S4, S6, S7, S8], done: true }
  - { id: A3, statement: "an assertion the run cannot evaluate blocks completion, naming the assertion and why, rather than counting as a pass", proof: "test:plugins/prove/tests/steps.test.ts", sources: [S7, S10], done: true }
  - { id: A4, statement: "a proof is a record in the project's artifact root, written by the proving phase and read by the others, with no phase reading another's records or queue", proof: "test:plugins/prove/tests/proof-record.test.ts", sources: [S11, S12], done: true }
  - { id: A5, statement: "a person can record a manual run as the proof, naming who ran it and each assertion's status", proof: "test:plugins/prove/tests/proof-record.test.ts", sources: [S13], done: true }
  - { id: A6, statement: "a proof whose code digest or brief revision no longer matches what it certified stops counting, and the unit it proved is unproven again", proof: "test:plugins/prove/tests/proof-record.test.ts", sources: [S14], done: true }
  - { id: A7, statement: "the proving plugin mounts on an install with no repository and proves a scenario whose steps check a published page and a sent message, and no file under packages/core changes for it", proof: "test:plugins/prove/tests/domains.test.ts", sources: [S17, S18], done: true }
  - { id: A8, statement: "the brief check refuses a step naming an operation no mounted plugin offers, or an input its schema refuses, naming the step and the operation", proof: "test:plugins/prove/tests/scenario.test.ts", sources: [S19, S30], done: true }
  - { id: A9, statement: "two briefs, one with a single request and one with two apps, a fixture and a human step, walk the same proving diagram; no diagram is written per task", proof: "test:plugins/prove/tests/scenario.test.ts", sources: [S20, S21], done: true }
  - { id: A10, statement: "a deterministic step runs no harness, an agent step runs one, and a wait-until step passes when its check holds before the deadline and fails naming the check after it", proof: "test:plugins/prove/tests/steps.test.ts", sources: [S22], done: true }
  - { id: A11, statement: "a fixture whose state already holds performs nothing, one that differs acts only on the difference, and one that cannot reach its state asks a person", proof: "test:plugins/prove/tests/fixtures.test.ts", sources: [S23], done: true }
  - { id: A12, statement: "for any number of runs and any order of claims and releases, a resource is never held by more runs than its capacity, a waiting run spends no attempt, and a released seat goes to the highest priority waiting", proof: "property:plugins/prove/tests/lease.property.test.ts#a_seat_held_twice", sources: [S24, S25, S44], done: true }
  - { id: A13, statement: "a lease whose holder stops renewing expires, and the run it belonged to goes back to waiting", proof: "test:plugins/prove/tests/lease.test.ts", sources: [S25], done: true }
  - { id: A14, statement: "a human step keeps its run's leases while it waits, asks in the work's thread, and the notifier names the step and the resources held; an answer resumes it, and its deadline escalates and releases them", proof: "test:plugins/prove/tests/human-step.test.ts", sources: [S26], done: true }
  - { id: A15, statement: "a resource is brought up, checked and taken down only by the commands its config names, through the commands port; one with no check is refused at mount, naming it", proof: "test:plugins/prove/tests/resources.test.ts", sources: [S27, S28], done: true }
  - { id: A16, statement: "the documented web example brings two worktrees' apps up side by side with portless, and no file in the proving plugin names portless", proof: "test:plugins/prove/tests/resources.test.ts", sources: [S27, S29], done: true }
  - { id: A17, statement: "the browser plugin opens, snapshots, acts on refs and diffs through agent-browser, the desktop plugin snapshots and acts through agent-desktop, and the terminal plugin runs a program, sends keys, waits for text and reads the screen through terminal-use", proof: "test:plugins/agent-browser/tests/operations.test.ts", sources: [S30, S32, S35], done: true }
  - { id: A18, statement: "a UI check passes when the accessibility trees match and the pixels differ within the threshold, goes to an agent otherwise, and is unsupported when the agent cannot settle it or the sizes differ", proof: "test:plugins/agent-browser/tests/ui-check.test.ts", sources: [S31, S33], done: true }
  - { id: A19, statement: "a passed agent step is replayed by the next run with no harness started, and a replay that breaks runs the agent from the step that broke", proof: "test:plugins/prove/tests/replay.test.ts", sources: [S34], done: true }
  - { id: A20, statement: "examples/a-whole-project mounts as one profile whose record walks BRIEF, WORK, PROVE and DONE, each phase a shipped workflow, its brief carrying a scenario the prove phase walks", proof: "test:examples/a-whole-project/tests/project.test.ts", sources: [S36, S37, S38, S41, S42], done: true }
  - { id: A21, statement: "two runs from different projects needing the same resource never hold it past its capacity, and the one waiting starts when the other releases", proof: "test:plugins/prove/tests/lease.test.ts", sources: [S39, S40], done: true }
crosses:
  - { mechanism: attempts-and-waits, answer: works, proof: "A12, A14; a run waiting for a lease or a person is a look, not an attempt" }
  - { mechanism: events-and-notifications, answer: works, proof: "A14" }
  - { mechanism: briefs, answer: works, proof: "A1, A8; the scenario is one more section of the brief the store keeps" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "A7, A15" }
  - { mechanism: calls, answer: n/a, why: "the proving workflow is called as the project's PROVE phase like any phase; a scenario is its input, not a call" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "a resource lease is the proving plugin's own, kept under Amy home; branch leases and lent revisions are unchanged" }
  - { mechanism: profiles-and-state, answer: works, proof: "A21; the lease directory is the machine's, like the Slack thread map, and no profile's own state is written" }
  - { mechanism: diagram, answer: works, proof: "A20; feature-grooming gains a workflow.mmd, read and refused at mount like every other" }
  - { mechanism: record-migration, answer: n/a, why: "feature-grooming was never a workflow, so no record of it was ever saved to migrate" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "a proof writes project artifacts and asks through the conversation; no tracker or code-host write is added" }
guarantee:
  - { holds: "a proven unit's scenario holds against the real system", not_against: "a well-proven scenario for the wrong feature" }
  - { holds: "no phase reads another phase's records or queue", not_against: "reading the proof record in the shared artifact root" }
  - { holds: "a resource is never held by more runs than its capacity, across every project on the machine", not_against: "a person or a process outside amy changing the resource while a run holds it" }
  - { holds: "a step the scenario marks deterministic starts no harness", not_against: "an operation whose own plugin calls a model inside it" }
failures:
  - { step: grooming, when: "a brief names no scenario, or a step names an operation nothing offers", goes_to: "cannot leave grooming; the check names the unit, the step and the operation" }
  - { step: proving, when: "an assertion cannot be evaluated", goes_to: "completion blocked, naming the assertion and why" }
  - { step: leasing, when: "a resource is at capacity", goes_to: "the run waits as a look and takes the next seat by priority" }
  - { step: leasing, when: "a holder stops renewing", goes_to: "its lease expires and its run goes back to waiting" }
  - { step: human step, when: "nobody answers before its deadline", goes_to: "the proof escalates and releases its leases" }
  - { step: resource, when: "its check fails after it is brought up", goes_to: "the run fails naming the resource and the check's output, and its leases are released" }
  - { step: lock, when: "code digest or brief revision moved", goes_to: "the unit is unproven again" }
cut:
  - "a domain's own operations (an integrations platform, an accounting sandbox, a publishing API, a call log): each is a plugin of its own; this row ships the runner and three drivers"
  - "picking ports, containers or runtimes: refused; a resource is the commands its person configures (S27)"
  - "amy doctor naming what an absent prove/ loses: a-project-is-brief-work-and-proof delivered the absent phase's reason in amy status"
  - "judging whether the work is any good: this proves a scenario holds"
  - "replacing the walkthrough: the state machine keeps its fast fake-world test; two tests, two subjects"
deviations:
  - "packages/workflow-feature-grooming: it no longer mounts `grooming-source` and `grooming-tracker` (S42): the core refuses to call a workflow that registers ports with `extend`, and nothing read them"
  - "feature-grooming's retry is `policy.briefLookMs` and the proving plugin's `policy.seatRetryMs`: a project's phases share one config, and refuse a key that means two things"
  - "the proving workflow ends at `PROVEN` and `refused`: the project's composition sends an end named `refused` back to the phase before it, and every other end to PROOF_COMPLETE"
  - "neither feature-grooming nor the proving plugin declares `phases:`: a project's anchor declaring a phase absent beside its present folder is refused, and either can be the anchor"
  - "A2's fake world is a scenario that calls no operation at all: the brief check refuses it, and a run only ever reaches the world through a mounted plugin's operation, never through the walkthrough"
  - "a run holding seats never waits past half a seat's life between looks, or the look that renews a seat would come after it ran out"
  - "a resource whose `up` ran and whose check then failed is taken down at the end of the run like one that came up"
  - "a run whose step failed or could not be evaluated is refused, asserted on or not, and the proof records the run's outcome: a refused run is never proven"
  - "a run holds every resource it needs or none: a seat taken while another is missing is given back, keeping its place in the queue"
  - "a seat's holder is the run named by its profile, and only a resource's last holder takes it down, no seat given until it is down"
  - "an agent step's calls become its replay only once every assertion on the step passed; a failed one's replay is forgotten"
  - "a wait-until check that answers past its deadline fails, and an answer posted past a human step's deadline does not resume it"
  - "packages/cli/src/project.ts: a project a later phase asks the brief something of waits in GROOMED after BRIEF until every phase's brief check is green (S43)"
  - "the lease lock names its owner; it is reclaimed only when that process is dead, under a recovery lock, after reading again that it is still the dead owner's (S44)"
  - "`prove.record` and `prove.show` find the proofs from the profile directory an operation is handed, a project's profile living beside its artifact root; plugins/prove/tests/proof-record.test.ts holds that to the CLI's own paths"
  - "plugins/prove/tests import the CLI's project composition and paths from its source, test-only, to check briefs and paths as the CLI does"
  - "vitest.config.ts, tsconfig.tests.json: the example's tests run and typecheck, and the new packages resolve to their source"
  - ".changeset/config.json: the private example is ignored by the release, as the test fixtures are"
  - ".allowed-root-files: `examples/` is a directory of the repository root"
  - ".software-factory/policy.yaml: the feature-grooming gate is activated by the workflow.mmd it now has, as every shipped workflow's gate is"
  - ".software-factory/evidence/**, .software-factory/locks/**: the activated gates re-run and re-sealed, and sf lock for the new packages"
  - "registry/plugin-prove.json, registry/plugin-agent-browser.json, registry/plugin-agent-desktop.json, registry/plugin-terminal.json, registry/workflow-feature-grooming.json: generated registry items"
  - "plans/next-steps.md, plans/one-real-ticket-walks-the-lifecycle.md: the delivered row leaves the board, and the plan citing this one cites where it lives now"
exit: "a brief with no scenario cannot leave grooming; a curl and a two-app scenario with a human step walk one proving workflow; two tickets needing one account take turns; the core is unchanged"
---
# A phase is proven, not asserted

Passing the tests a branch can run is not evidence the work holds, and what
proves work is the domain's: the app running, the post published, the call
made. So the proof is a plugin: one workflow walks the scenario each brief
settled, through the operations its drivers offer, leasing what two tickets
proving at once would otherwise fight over.
