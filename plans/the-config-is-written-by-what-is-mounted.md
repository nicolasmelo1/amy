# The config is written by what is mounted

`amy init` writes a config of 261 lines, about 70 of them settings, for every
workflow this repository ships, whichever one the person is about to drive
(`EXAMPLE_CONFIG`, `packages/cli/src/config.ts:491`). It is that long on
purpose: `checkConfigTemplate` (`packages/cli/src/config-template.ts`) fails
the build when a setting is missing from the template, because a setting
nobody can find does not exist in practice. The rule is right. What it gets
wrong is where a setting is found. Every setting is discoverable, but every
one is also put in front of somebody who will never use it.

The length comes from the config's shape. Most top-level blocks are one
workflow's vocabulary:

- `policy:` is the ticket workflow's ceilings, kept by the host
  (`packages/cli/src/config.ts:116`). It holds `maxImplementAttempts`,
  `rosterBackoffMs`, `maxOpenReviewsPerReviewer`, `maxPullRequestFiles`,
  `writes` and `conversation`. The comment above it says so: "The numbers were
  the ticket workflow's defaults; the shape is the host's."
- `plans:` belongs to note-to-plan and `errands:` to the errand, and the CLI
  imports both workflows' `Policy` types to type them
  (`packages/cli/src/config.ts:3-4`).
- `qaStatusName`, `workingStatusName` and `repoByTeam` sit at the top level and
  are read by one workflow and one tracker.
- The serial engine takes its `retryDelayMs` from the ticket workflow's
  `pollBackoffMs` (`packages/cli/src/slices.ts:124`), so the engine's retry
  changes when somebody tunes how often a ticket looks at a review.

`pluginSlices` (`packages/cli/src/slices.ts:14`) translates this shape into
each plugin's settings. Its comment calls it "a compatibility shim", and says
that an explicit `plugins:` slice always wins, "which is the direction this is
moving in". This plan moves the config that way.

## What changes

**A workflow's settings live under that workflow.** Each profile under
`workflows:` carries the settings of the workflow it drives, checked against
that workflow's `configSchema` the way every plugin's are
([a config is typed by its schema](../docs/design/a-config-is-typed-by-its-schema.md)):

```yaml
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"
    settings:
      qaStatusName: In QA
      policy:
        maxImplementAttempts: 3
        rosterBackoffMs: 1800000
```

The top level keeps only what belongs to the machine: `repos`,
`workspaceRoot`, branches and checkouts, `agent`, `notify`, `worktrees`,
`autoUpdate` and the engine's `staleClaimMs`, `retentionDays` and
`maxItemAttempts`. `policy:`, `plans:`, `errands:`, `qaStatusName` and
`workingStatusName` stop being top-level keys. `repoByTeam` moves under the
Linear plugin's slice, the only thing that reads it.

**The engine gets its own retry delay.** `@amykit/plugin-serial-engine`
declares `retryDelayMs` in its schema with the default it has today, and
`slices.ts` stops deriving it from a workflow's policy.

**The host names no workflow's settings.** The CLI loses the `Policy` and
`DEFAULT_POLICY` it keeps for the ticket workflow, the imports of
note-to-plan's and the errand's types, and the slices that copy top-level keys
into those workflows. Each workflow's defaults are its own, merged by the mount
as they already are for every other plugin.

**`amy init` writes the machine, and `amy add` writes the workflow.**
`init` writes the top-level settings and a commented line pointing at
`amy add`. `amy add <workflow>` appends the profile block, with each setting
the schema marks `required` filled in as a placeholder and the rest left out.
A workflow can also ship the block itself as one of its `files`
([a plugin brings its own commands](a-plugin-brings-its-own-commands.md)) when
a commented example teaches more than the schema does.

**`amy config explain` is where a setting is found.** It prints every setting
of the machine and of each mounted plugin, with type, default and description,
generated from the schemas, and `amy config explain <plugin>` narrows it to
one. `checkConfigTemplate` keeps its purpose and changes what it checks. It no
longer requires every setting in the template. It requires every setting to
have a description in its schema, so `explain` has nothing to leave out, and it
still parses and boots what `init` and `add` write.

**`amy update` moves an existing config, once.** The top-level keys that moved
are rewritten under the profiles that mount the workflow reading them, the
original is kept as `config.yaml.moved`, and running it again changes
nothing. A key left at the old place afterwards is refused at boot by name,
saying where it now lives. It is never read from the old place without a
word.

## Acceptance criteria

- [ ] `amy init` on an empty machine writes a config with no workflow's
      settings in it, and `amy add @amykit/workflow-errand` appends a profile
      block that boots without being edited
      (proof: deferred:assertion:errand.init_and_add_write_a_config_that_boots)
- [ ] `amy config explain` lists every setting of every mounted plugin with
      its default and description, and a setting a schema declares without a
      description fails the build naming it
      (proof: deferred:test:packages/cli/tests/config-explain.test.ts)
- [ ] The serial engine's retry delay does not change when the ticket
      workflow's `pollBackoffMs` does
      (proof: deferred:assertion:lifecycle.the_engine_retries_on_its_own_delay)
- [ ] `amy update` on a config with top-level `policy:`, `plans:` and
      `errands:` moves each under the profiles that read it, keeps the
      original, and is a no-op the second time; a moved key put back at the
      top level is refused at boot naming its new place
      (proof: deferred:assertion:update.the_settings_move_under_their_workflow)
- [ ] The CLI imports no workflow package, for a type or anything else
      (proof: deferred:test:packages/cli/tests/architecture.test.ts)

**Exit condition:** in the errand's scenario, through the installed
executable, `amy init` and `amy add` write a config short enough to read in one
screen that boots unedited, and `amy config explain` lists every setting it
could change. In `amy update`'s scenario an install configured for all three
shipped workflows updates into the new shape, and the `ticket-to-qa`, errand
and `amy update` gates require their assertions.
