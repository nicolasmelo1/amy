# Amy add and amy remove

Adding a workflow to an install took four moves: install the package yourself
into a directory amy might not resolve from, write a `workflows:` entry by
hand, work out which plugins it needs, and run `amy doctor` until the boot
refusals stop. `amy plugin add` did one of the four, and only for a plugin —
and it had a smaller thing wrong inside it: it wrote
`[...pluginList(config, profile), spec]`, and `pluginList` returns the
*recommended* set when the profile lists nothing, so adding one plugin froze
today's recommendation into the config permanently, with nothing saying so.

## What shipped

Two commands at the top level, `amy add <spec>` and `amy remove <spec>`,
because adding a workflow and adding a plugin are the same act from the
operator's side and only differ in what came back. The spec is the whole
vocabulary the installer already had — a package name, a tarball or git URL,
a path — decided once by the same classifier `plugin add` uses.

**Which of the two it is, is asked rather than assumed.** No name convention,
no `package.json` field: the package is mounted alone into a throwaway
registry on paths nothing reads, and the answer is `mounted.workflow`. A
package that registers a workflow is a workflow; everything else is a plugin.
That is the same question `mount()` answers at boot, asked one package at a
time.

A workflow becomes a profile — the name read out of the package name, the way
`amy workflow new` names one — and gets its records directory and its queue
from the paths the profile already lays out. A plugin is appended to the new
machine-wide `extraPlugins:` list, which every profile mounts after its own
set. Appending there rather than into a profile's `plugins:` is what fixes
the frozen recommendation: a profile left on the recommended set stays on it
and gains one, and the recommendation is derived at every read, so a later
amy recommending one more plugin hands it to that profile too. A plugin named
in both places is deduplicated, because `mount()` would refuse the second
claim of a port.

The order is the order of an undo: install, import, probe, write, boot. A
path that is not a package is refused before anything is run; a package that
fails to import or fails to mount alone is uninstalled again; a package that
mounts but leaves the machine unable to boot is reported rather than rolled
back — the entry is correct, the machine is short a plugin, and the operator
reads which one before the next tick.

`amy remove` is the same in reverse: it refuses a name the config does not
carry, refuses while the workflow is running, and then mounts the machine the
config *would* become — profile, extras and slice all emptied of the spec —
and refuses with the mount's own refusal, naming the action that would have
no port. Otherwise it drops the entry, clears a default pointing at a removed
profile, rewrites the private npm manifest, prunes and reinstalls the root,
and never touches records, queue or log. Making the manifest authoritative is
what removes npm 10 `file:` dependencies too: npm's own `uninstall` says
success while leaving those links behind.

## The proof

New gate `amy-add-remove`, whose scenario installs the command onto a scratch
machine, adds the same third-party workflow three ways — from a path, from a
tarball URL, and from a directory that is not a package — drives one piece of
work, then removes it and drives nothing.

## Acceptance criteria

- [x] A workflow added from a path drives work, with no config edited by hand
      (proof: assertion:add.a_path_becomes_a_workflow_that_runs)
- [x] A machine-wide plugin can be added and removed before any workflow exists
      (proof: assertion:add.a_plugin_can_be_added_before_any_workflow)
- [x] The same workflow added from a tarball URL is the same install
      (proof: test:packages/cli/tests/add.test.ts)
- [x] Whether it was a workflow or a plugin is decided by mounting it
      (proof: test:packages/cli/tests/add.test.ts)
- [x] A package that mounts as a plugin joins the profile without copying the
      recommended set into the config
      (proof: assertion:add.adding_one_plugin_keeps_the_recommendation)
- [x] A package that does not mount is uninstalled again, and says why
      (proof: test:packages/cli/tests/add.test.ts)
- [x] `amy remove` drops the entry and the package, and keeps every record
      (proof: assertion:add.removing_keeps_the_state)
- [x] Removing something the workflow still needs is refused, naming the
      action that would have no port
      (proof: assertion:add.a_removal_that_would_not_boot_is_refused)
- [x] Adding the same thing twice is one install and says so
      (proof: test:packages/cli/tests/add.test.ts)