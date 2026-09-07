# Plugins are installed, not compiled in

A plugin that wraps a CLI which is not on the machine has no reason to be on
the machine. `@amykit/plugin-claude` shells out to `claude`; on a box without it
the plugin is dead weight that still has to be mounted, configured around and
reasoned about.

Today it travels anyway, because there is exactly one artifact and everything
is inside it.

## What goes, and what comes back

`bun build --compile` goes, and the single executable with it. What ships is
built JavaScript, run by node, installed from a registry.

The `BUILT_INS` table in `packages/cli/src/loader.ts` goes with it. That table
exists for one reason, stated in its own comment: a bundler follows a
specifier it can read and cannot follow a variable. With no bundler in the
path, `import(spec)` is correct again — and the loader already has that path,
for third-party plugins, under a comment saying the table *"is what ships in
the box, not a list of what is allowed"*. The box stops existing and the
second half of that sentence becomes the whole design.

`DEFAULT_PLUGINS` stops meaning "what is in the binary" and starts meaning
"what `amy init` suggests installing". A recommendation, not an inventory.

## And a workflow is a name in a config

The same sentence from the other side. Installing a plugin nobody here wrote
is worth nothing if the thing that would drive it has to be listed in this
package: `PROFILES` was a closed union of two literals, so
`amy --workflow oncall` answered "there is no oncall workflow" no matter what
was on the machine. The engine's seam was open and the command line was not.

So a profile becomes an entry in the config — a name, the workflow package it
drives, and optionally the plugins to mount under it. The two this repository
ships are what a config with no `workflows:` block gets, which is a default
rather than an inventory.

The second half of that is where state lives. The directories were chosen by
an `if` on the profile, so a third workflow would have written its records
over the first's. One directory per profile, named after it, and swapping
which workflow you drive stops costing you the other one's state.

## The risk does not go away, it moves

The bug this table was built to prevent — every test green, a binary with no
plugins in it — cannot happen without a bundler. The failure it becomes is a
config naming a plugin nobody installed, and that one is not hypothetical
either: it is what every machine will hit the first time somebody copies a
config from a box that had more installed than this one does.

So the boot refusal becomes the load-bearing part, where the table used to
be. Named and missing has to be refused **before** a ticket is touched, and
the refusal has to name the plugin and what was there instead. That is the
same shape the relay already holds itself to for a mistyped agent ladder
(`relay.refuses_an_unknown_agent_at_boot`), and there is no reason for a
plugin to be held to less.

## What phase 6 was actually about, and why it survives

`docs/design/what-runs-is-not-this-repo.md` named two problems. The compiled binary
was the answer it chose, not the problem it solved, and both problems outlive
the answer.

**The code under test is never the code that ships.** Compiling was one way to
force the question. Installing from a registry is another, and it is the one
that matches how this now works: the proof becomes a machine that installs the
published packages and runs a ticket, rather than a machine that runs a file
somebody compiled.

**The working directory must not be a repository.** Unchanged and still true.
A global install into a directory on `PATH` satisfies it exactly as the binary
did.

What does not survive is the gate's wording. `installed.plugins_are_inside_
the_binary` and `installed.every_plugin_resolves` assert the opposite of this
design, so the `installed-binary` gate in `.software-factory/policy.yaml` is
rewritten rather than dropped — the claim it protects is still worth
protecting, and it is only the mechanism underneath it that changed. Its
criteria stay in its own plan, where they are still true of an install that
nobody compiled.

## What this does not finish

Two names remain in the host. `@amykit/workflow-ticket-to-qa` is still a
dependency of `@amykit/cli`, because the roster — who is reviewing today — is
that workflow's vocabulary living in the host, and `@amykit/plugin-notify-hermes`
is still one because `amy doctor` checks a delivery target by importing the
function that reads the listing. Both are the same shape of problem and
neither is this phase: they are a host holding a plugin's knowledge, not a
host that cannot resolve a plugin.

## Acceptance criteria

- [x] A machine installs `@amykit/cli` and a subset of plugins and runs work
      with the rest never present
      (proof: assertion:plugins.a_machine_installs_only_what_it_uses)
- [x] Plugins resolve by name from disk at run time, with no literal-import
      table anywhere
      (proof: assertion:plugins.resolve_at_run_time_with_no_table)
- [x] A workflow package this repository never shipped mounts, by being named
      in a config (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)
- [x] The same engine drives it, having learnt nothing
      (proof: assertion:plugins.the_engine_drives_it_without_knowing_it)
- [x] Work that workflow finds reaches the queue
      (proof: assertion:plugins.work_it_found_reached_the_queue)
- [x] Each profile keeps its own records and queue, so swapping which
      workflow runs loses neither
      (proof: assertion:plugins.each_workflow_keeps_its_own_state)
- [x] A workflow name nobody declared is refused with the names there were
      (proof: assertion:plugins.an_unknown_workflow_name_lists_the_ones_there_are)
- [x] A workflow this repository ships and this machine never installed is
      refused by name
      (proof: assertion:plugins.a_shipped_workflow_nobody_installed_is_refused_by_name)
- [x] A config naming a plugin nobody installed is refused at boot, before a
      piece of work is touched
      (proof: assertion:plugins.a_missing_plugin_is_refused_at_boot)
- [x] That refusal names what was installed instead
      (proof: assertion:plugins.the_refusal_names_what_was_installed_instead)
- [x] Nothing about the work changes on the way to that refusal
      (proof: assertion:plugins.nothing_is_touched_before_the_refusal)
- [x] `amy plugin list` distinguishes installed from mounted, so a missing
      plugin is visible before it is needed
      (proof: assertion:plugins.the_listing_tells_installed_from_mounted)

**Exit condition:** a second machine with node, `@amykit/cli` and only the
plugins it needs runs work end to end, a workflow it wrote itself drives on
the same engine, a plugin it never installed is refused by name at boot rather
than at first use, and no machine carries code for a tool it does not have.
