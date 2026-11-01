---
"@amykit/cli": minor
"@amykit/core": minor
"@amykit/workflow-ticket-to-qa": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/plugin-file-notes": minor
"@amykit/plugin-file-tasks": minor
"@amykit/plugin-file-worktree": minor
"@amykit/plugin-agent-relay": minor
---

**A command belongs to the package that means it.** A plugin declares
`commands`, `checks` and `files` beside `register`, read after the module is
imported and before anything mounts: `amy --help` lists `amy roster` beside
the workflow that brought it, `amy doctor` runs the checks it brought, and
`amy init`/`amy add` write the files it brought into the profile's state,
once. A command that declares `mount: true` receives the mounted ports or a
refusal naming why the machine did not come up; every other command answers on
the machine that will not boot, which is when it matters.

The host keeps the entry point and the ownership rules. A name belongs to one
package, reusing a built-in or another package's command is refused at load
naming both owners, and a command run against a profile that does not mount
its owner names the profiles that do.

`amy btw` moved to the errand, `amy note` to note-to-plan, `amy roster` to
ticket-to-qa, `amy worktrees` to the worktree adapter and `amy models` to the
relay; the CLI imports none of them. `pause` and `resume` became
`amy stop --all` and `amy start`, `discover` became the first act of `amy
tick` and is hidden rather than listed, `poke` became `look`, `workflow rm` merged into
`amy remove <profile>` with `--keep-state`, the two `plugin add`/`plugin
remove` verbs are gone, and `daemon`/`after-daemon` are hidden and still
callable. A price table older than seven days is refreshed by `amy update`
and `amy start` through the relay's own command, and a refresh that fails
leaves the table as it was.

Because `tick` now looks before it moves, two loops it exposed are closed: a
note the machine wrote about its own failure is not itself planned, and
discovery does not bring back work that reached its attempt ceiling: the
record says `gaveUp`, and `amy look <id>` is the only thing that clears it.

`HostPaths` gains `profile`, the directory a profile owns, so a workflow that
keeps a file beside its records — the roster — reads what its own command
writes. The roster moved there, which is why `amy init` no longer writes it on
a machine that mounts nothing that assigns reviewers.
