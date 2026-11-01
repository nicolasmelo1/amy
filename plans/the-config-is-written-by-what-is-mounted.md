---
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/config.ts:491", said: "amy init writes EXAMPLE_CONFIG, 261 lines with about 70 settings, for every shipped workflow, whichever one the person will drive" }
  - { id: S2, kind: code, ref: "packages/cli/src/config-template.ts", said: "checkConfigTemplate fails the build when the template misses a setting, since a setting nobody finds does not exist. Right rule, wrong place: every setting is put before somebody who never uses it" }
  - { id: S3, kind: code, ref: "packages/cli/src/config.ts:116", said: "policy: is the ticket workflow's ceilings kept by the host (maxImplementAttempts, rosterBackoffMs, maxOpenReviewsPerReviewer, maxPullRequestFiles, writes, conversation): 'the numbers were the ticket workflow's defaults; the shape is the host's'" }
  - { id: S4, kind: code, ref: "packages/cli/src/config.ts:3-4", said: "plans: is note-to-plan's and errands: the errand's, and the CLI imports both Policy types; top-level qaStatusName, workingStatusName and repoByTeam are read by one workflow and one tracker" }
  - { id: S5, kind: code, ref: "packages/cli/src/slices.ts:124", said: "the serial engine's retryDelayMs comes from the ticket workflow's pollBackoffMs, so tuning how often a ticket looks at a review changes the engine's retry" }
  - { id: S6, kind: code, ref: "packages/cli/src/slices.ts:14", said: "pluginSlices, 'a compatibility shim', maps this shape to plugin settings; an explicit plugins: slice always wins, 'the direction this is moving in'" }
  - { id: S7, kind: reference, ref: "docs/design/a-config-is-typed-by-its-schema.md", said: "each workflows: profile carries its workflow's settings, checked against its configSchema: `ticket-to-qa: { workflow: '@amykit/workflow-ticket-to-qa', settings: { qaStatusName: In QA, policy: { maxImplementAttempts: 3, rosterBackoffMs: 1800000 } } }`" }
  - { id: S8, kind: decision, said: "the top level keeps the machine: repos, workspaceRoot, branches and checkouts, agent, notify, worktrees, autoUpdate, the engine's staleClaimMs, retentionDays, maxItemAttempts" }
  - { id: S9, kind: decision, said: "policy, plans, errands, qaStatusName and workingStatusName stop being top-level keys; repoByTeam moves under the Linear plugin's slice, its only reader" }
  - { id: S10, kind: decision, said: "plugin-serial-engine declares retryDelayMs in its schema with today's default; slices.ts stops deriving it from a workflow's policy" }
  - { id: S11, kind: decision, said: "the CLI loses Policy, DEFAULT_POLICY, the note-to-plan and errand type imports, and the slices copying top-level keys into workflows; each workflow's defaults are merged by the mount, as for every plugin" }
  - { id: S12, kind: decision, said: "init writes the top-level settings and a commented line pointing at amy add; amy add <workflow> appends the profile block, schema-required settings as placeholders, the rest left out" }
  - { id: S13, kind: reference, ref: "plans/a-plugin-brings-its-own-commands.md", said: "a workflow may ship the block as one of its files when a commented example teaches more than the schema" }
  - { id: S14, kind: decision, said: "amy config explain prints every setting of the machine and each mounted plugin with type, default and description, from the schemas; amy config explain <plugin> narrows to one" }
  - { id: S15, kind: code, ref: "packages/workflow-errand/src/plugin.ts", said: "a schema typing policy as a record hides it: the errand's maxAttempts, default 2, lives in observation.ts beside the DEFAULT_POLICY defineWorkflow merges, not in configSchema" }
  - { id: S16, kind: decision, said: "each policy setting is declared in the schema with type, default and description; the mount refuses policy defaults naming an undeclared key, or a schema default differing from the one the decision reads" }
  - { id: S17, kind: decision, said: "checkConfigTemplate stops requiring every setting in the template; it requires every setting, nested included, to have a schema description, and still parses and boots what init and add write" }
  - { id: S18, kind: decision, said: "amy update rewrites moved top-level keys under the profiles mounting the workflow that reads them, keeps the original as config.yaml.moved, and changes nothing when run again" }
  - { id: S19, kind: decision, said: "a key left at its old place afterwards is refused at boot by name, saying where it now lives" }
touches:
  - packages/cli/src/config.ts
  - packages/cli/src/config-template.ts
  - packages/cli/src/slices.ts
  - packages/cli/src/add.ts
  - packages/cli/src/update.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/config-explain.test.ts
  - packages/cli/tests/architecture.test.ts
  - packages/cli/package.json
  - packages/core/src/define-workflow.ts
  - packages/core/tests/define-workflow.test.ts
  - plugins/serial-engine/src/config.ts
  - plugins/serial-engine/src/plugin.ts
  - plugins/linear/src/config.ts
  - plugins/linear/src/plugin.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-errand/src/plugin.ts
  - packages/workflow-note-to-plan/src/plugin.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "amy init on an empty machine writes a config with no workflow's settings, and amy add @amykit/workflow-errand appends a profile block that boots without being edited", proof: "deferred:assertion:errand.init_and_add_write_a_config_that_boots", sources: [S1, S7, S8, S9, S12, S13] }
  - { id: A2, statement: "amy config explain lists every mounted plugin's setting with default and description, the errand's policy.maxAttempts default 2 among them; a schema setting without a description fails the build naming it", proof: "deferred:test:packages/cli/tests/config-explain.test.ts", sources: [S2, S14, S15, S17] }
  - { id: A3, statement: "a workflow whose policy defaults carry a key its schema does not declare, or a default the schema states differently, is refused at mount, naming the key", proof: "deferred:test:packages/core/tests/define-workflow.test.ts", sources: [S15, S16] }
  - { id: A4, statement: "the serial engine's retry delay does not change when the ticket workflow's pollBackoffMs does", proof: "deferred:assertion:lifecycle.the_engine_retries_on_its_own_delay", sources: [S5, S10] }
  - { id: A5, statement: "amy update moves top-level policy:, plans: and errands: under the profiles reading each, keeps the original, is a no-op the second time; a moved key put back top-level is refused at boot naming its new place", proof: "deferred:assertion:update.the_settings_move_under_their_workflow", sources: [S18, S19] }
  - { id: A6, statement: "the CLI imports no workflow package, for a type or anything else", proof: "deferred:test:packages/cli/tests/architecture.test.ts", sources: [S3, S4, S6, S11] }
crosses:
  - { mechanism: calls, answer: n/a, why: "the mount only checks a workflow's policy defaults against its schema; how one workflow calls another is untouched" }
  - { mechanism: hooks, answer: n/a, why: "before, after and interrupt are untouched; only policy defaults are checked at mount" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "repoByTeam moves into the Linear plugin's slice; no tracker write changes" }
  - { mechanism: engines, answer: n/a, why: "only where the serial engine reads retryDelayMs from changes; its default and the record it ends in do not" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A1, A5" }
  - { mechanism: config, answer: works, proof: "deferred:A2, A5" }
guarantee:
  - { holds: "a moved key is never read from its old place without a word" }
exit: "errand's scenario, installed executable: init and add write a one-screen config booting unedited; config explain lists every setting. update's scenario moves an all-three-workflows install to the new shape. ticket-to-qa, errand and update gates require their assertions"
---
# The config is written by what is mounted

`amy init` puts every shipped workflow's settings in front of somebody who will drive one, because the config's top level is one workflow's vocabulary and the host translates it through a compatibility shim.
