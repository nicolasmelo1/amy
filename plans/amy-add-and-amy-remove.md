# `amy add` and `amy remove`

Adding a workflow to an install takes four moves today: install the package
yourself into a directory amy might not resolve from, write a `workflows:`
entry by hand, work out which plugins it needs, and run `amy doctor` until the
boot refusals stop. `amy plugin add` does one of the four, and only for a
plugin.

There is a smaller thing wrong inside it. `plugin add` writes
`[...pluginList(config, profile), spec]` (`index.ts:874`), and `pluginList`
returns the *recommended* set when the profile lists nothing
(`slices.ts:166`). So adding one plugin freezes today's recommendation into
your config permanently: a later amy that recommends a new plugin will not
give it to you, and nothing will say so.

## What changes

Two commands at the top level, because adding a workflow and adding a plugin
are the same act from the operator's side and only differ in what came back.

```sh
amy add @acme/workflow-oncall            # from the registry
amy add ./workflow-oncall                # from a path
amy add https://example.com/wf.tgz       # from a URL
amy remove @acme/workflow-oncall
```

**Which of the two it is, is asked rather than assumed.** No name convention,
no `package.json` field: install it, mount it alone into a throwaway registry,
and see whether `mounted.workflow` is set. A package that registers a workflow
is a workflow; everything else is a plugin. That is the same question
`mount()` already answers at boot, asked one package at a time.

A workflow lands in `~/.amy/workflows` and gets a profile entry, its records
directory and its queue. A plugin lands in `~/.amy/plugins` and is appended to
the current profile — appended to what the profile *itself lists*, so a
profile that was on the recommended set stays on it and gains one, rather than
having the recommendation copied in behind your back.

`amy remove` is the same in reverse: drop the entry, uninstall from the root,
and never touch records, queue or log. It refuses when what is left would not
boot, and names the action that would have no port — the refusal the mount
already writes, moved to the moment somebody can still change their mind.

A package that fails to mount is uninstalled again. A half-added workflow that
only shows up as a boot refusal three commands later is worse than a command
that failed.

## The gate

New: `amy-add-remove`, with a scenario in
`.software-factory/evidence/amy-add-remove-scenario.sh`, joined to
`npm run e2e`. Activation on `packages/cli/src/index.ts`,
`packages/cli/src/spec.ts`, `packages/cli/src/registry.ts` and
`packages/cli/src/config.ts`.

The scenario installs the command onto a scratch machine, adds the same
third-party workflow three ways — from a path, from a tarball and from a
directory that is not a package — drives one piece of work, then removes it
and drives nothing.

## Acceptance criteria

- [ ] A workflow added from a path drives work, with no config edited by hand
      (proof: assertion:add.a_path_becomes_a_workflow_that_runs)
- [ ] The same workflow added from a tarball URL is the same install
      (proof: assertion:add.a_url_and_a_path_agree)
- [ ] Whether it was a workflow or a plugin is decided by mounting it
      (proof: assertion:add.what_it_is_comes_from_mounting_it)
- [ ] A package that mounts as a plugin joins the profile without copying the
      recommended set into the config
      (proof: assertion:add.adding_one_plugin_keeps_the_recommendation)
- [ ] A package that does not mount is uninstalled again, and says why
      (proof: assertion:add.a_package_that_does_not_mount_leaves_nothing)
- [ ] `amy remove` drops the entry and the package, and keeps every record
      (proof: assertion:add.removing_keeps_the_state)
- [ ] Removing something the workflow still needs is refused, naming the
      action that would have no port
      (proof: assertion:add.a_removal_that_would_not_boot_is_refused)
- [ ] Adding the same thing twice is one install and says so
      (proof: test:packages/cli/tests/add.test.ts)

**Exit condition:** somebody with only `@amykit/cli` installed types one
command with a URL, a package name or a path in it, and the next `amy tick`
moves a piece of work through the workflow that arrived.
