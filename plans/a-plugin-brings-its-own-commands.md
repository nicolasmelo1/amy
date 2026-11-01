---
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/index.ts", said: "every command is written into index.ts; amy roster confirm and show (index.ts:2543) are ticket-to-qa commands every install carries, whichever workflow it drives" }
  - { id: S2, kind: code, ref: "packages/cli/src/doctor.ts", said: "amy doctor checks a roster (doctor.ts:195) and amy init writes one (index.ts:266), even on a machine that will never assign a reviewer" }
  - { id: S3, kind: reference, said: "Django registers a manage.py command per module in an installed app's management/commands; a Rails engine loads its Rake tasks and generators through its railtie; the framework owns the entry point, installs fill it" }
  - { id: S4, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "amy is a framework for workflows the way Rails is for web applications, and its entry point should work the same way" }
  - { id: S5, kind: friction, said: "amy --help lists 27; the daily operator uses only start, never ran btw or remove, cannot tell pause from stop or resume from start, nor what poke, daemon, after-daemon are for" }
  - { id: S6, kind: decision, said: "a plugin can declare commands, checks and files: plain data read after load() without a mount, because commands run while the machine is broken; defineWorkflow accepts the same three members" }
  - { id: S7, kind: decision, said: "commands become amy <name>, in amy --help beside built-ins marked with their package; run receives the profile's state directory, its schema-typed settings slice, the arguments and an output, not ports" }
  - { id: S8, kind: decision, said: "a command declaring mount: true gets the mounted ports, or a refusal naming why the machine did not come up" }
  - { id: S9, kind: decision, said: "checks run inside amy doctor after the host's own, under the plugin's name, returning the host's Check, so a red one fails doctor the same way" }
  - { id: S10, kind: decision, said: "files are written by amy init and amy add into the profile's state directory directoriesFor gives (packages/cli/src/profiles.ts:184); an existing file is never overwritten" }
  - { id: S11, kind: decision, said: "commands are those of every plugin the configured profiles mount; one run against a profile not contributing it is refused, naming profiles that do; --workflow picks when two profiles mount the package" }
  - { id: S12, kind: decision, said: "a name is owned once: reusing a built-in or another package's name is refused at CLI load naming both owners; a plugin cannot replace doctor, tick or update" }
  - { id: S13, kind: decision, said: "a built-in makes sense on every install, including errand-only; what fails it moves, merges, hides or goes" }
  - { id: S14, kind: reference, ref: "plans/the-roster-belongs-to-its-workflow.md", said: "amy roster moves to @amykit/workflow-ticket-to-qa: only ticket-to-qa assigns reviewers" }
  - { id: S15, kind: code, ref: "packages/cli/src/index.ts", said: "amy btw builds FileTasks and FileQueue by hand (index.ts:850); it moves to @amykit/workflow-errand, the amy-btw skill beside it" }
  - { id: S16, kind: code, ref: "packages/cli/src/index.ts", said: "amy note builds FileNotes by hand (index.ts:785) and reads plans.repos, note-to-plan's setting; it moves to @amykit/workflow-note-to-plan" }
  - { id: S17, kind: code, ref: "packages/cli/src/index.ts", said: "amy worktrees builds a WorktreeManager from @amykit/plugin-file-worktree by hand (index.ts:2584); it moves to @amykit/plugin-file-worktree" }
  - { id: S18, kind: decision, said: "amy models moves to @amykit/plugin-agent-relay, reading @amykit/model-specs: model prices are the business of whatever calls an agent" }
  - { id: S19, kind: decision, said: "an adapter built by hand bypasses its port, so a different adapter mounted instead is never seen; the CLI then imports no plugin-file-notes, -tasks or -worktree, and a rule keeps it so" }
  - { id: S20, kind: code, ref: "packages/cli/src/index.ts", said: "start/stop run and end one workflow's loop (:493, :573); pause/resume are a machine handbrake: in-flight work ended, nothing new, loop up, a file surviving reboot (:451, :467)" }
  - { id: S21, kind: decision, said: "pause and resume go; amy stop ends the selected workflow's loop and its in-flight run, as its SIGTERM already does" }
  - { id: S22, kind: decision, said: "amy stop --all is the handbrake: ends every loop and run in flight, including an amy run in another terminal; nothing starts until amy start releases it; it covers pause's hold-while-deploying case" }
  - { id: S23, kind: decision, said: "discover goes: the loop discovers every pass (index.ts:643); it existed so the quickstart could queue work before one tick, so tick discovers first and the quickstart loses the step" }
  - { id: S24, kind: decision, said: "daemon (the foreground loop start runs) and after-daemon (spawned by start to update once a loop exits, index.ts:559) are hidden: still callable, out of amy --help" }
  - { id: S25, kind: decision, said: "amy remove (uninstall, index.ts:1648) and workflow rm (records, queue, config entry, index.ts:2456) merge: amy remove <workflow> does both, asking before deleting state, accepting --keep-state; workflow rm goes" }
  - { id: S26, kind: decision, said: "amy plugin add and remove, which only edit a profile's mount list, go; amy add and amy remove are the verbs, amy plugin only lists" }
  - { id: S27, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "poke becomes amy look <id>: brings one work forward instead of waiting out its backoff (index.ts:726); once that plan lands the webhook does it, the command for rare cases" }
  - { id: S28, kind: decision, said: "today only amy models refresh calls refreshFrom; amy update and amy start refresh a table older than seven days, keeping what models.dev lacks; amy models shows the table" }
  - { id: S29, kind: decision, said: "afterwards built-ins are init, doctor, add, remove, update, start, stop, status, tick, run, look, queue, budget, brief, skills, workflow, plugin, each meaning the same on every install" }
  - { id: S30, kind: decision, said: "a command has a description and may have subcommands, one marked default: true; ticket-to-qa declares roster (confirm stamps today's date; show, the default, prints it and whether current), checks: [rosterIsConfirmed], files: roster.yaml" }
touches:
  - packages/core/src/plugin.ts
  - packages/core/src/define-workflow.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/loader.ts
  - packages/cli/src/add.ts
  - packages/cli/src/remove.ts
  - packages/cli/src/update.ts
  - packages/cli/src/poke.ts
  - packages/cli/src/workflow.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-errand/src/plugin.ts
  - packages/workflow-note-to-plan/src/plugin.ts
  - plugins/file-worktree/src/plugin.ts
  - plugins/agent-relay/src/plugin.ts
  - packages/cli/tests/plugin-commands.test.ts
  - packages/cli/tests/remove.test.ts
  - packages/cli/tests/models.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a plugin outside this repository declaring a command, installed with amy add, appears in amy --help marked with its package, runs, and disappears when removed", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S3, S4, S6, S7] }
  - { id: A2, statement: "a plugin command runs while the configured machine fails to mount, and a mount: true command on the same machine is refused with the mount's reason", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S6, S8] }
  - { id: A3, statement: "a plugin command named like a built-in, or like another package's command, is refused at load, naming both owners", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S12] }
  - { id: A4, statement: "a plugin's check turns amy doctor red under the plugin's name, and a plugin's file is written by amy init once and never overwritten", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S2, S9, S10] }
  - { id: A5, statement: "in the ticket-to-qa scenario, through the installed executable, amy --help lists amy roster as the workflow's command and it runs", proof: "deferred:assertion:lifecycle.a_workflow_command_is_its_own", sources: [S1, S14, S30] }
  - { id: A6, statement: "in the errand's scenario, on a machine mounting nothing that contributes it, amy roster does not exist", proof: "deferred:assertion:errand.a_command_nothing_mounts_does_not_exist", sources: [S11] }
  - { id: A7, statement: "on an errand-only machine amy --help lists no pause, resume, discover, daemon, after-daemon, poke, btw, note, worktrees, roster or models, and the hidden two still run", proof: "deferred:assertion:errand.help_lists_only_the_machines_commands", sources: [S5, S13, S21, S24, S27, S29] }
  - { id: A8, statement: "amy btw, note, worktrees and models appear on a machine mounting their owner, and the CLI imports none of plugin-file-notes, plugin-file-tasks or plugin-file-worktree", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S15, S16, S17, S18, S19] }
  - { id: A9, statement: "amy stop --all ends every loop and an amy run in flight, nothing starts until amy start, and amy start releases it", proof: "deferred:assertion:lifecycle.stop_all_holds_until_start", sources: [S20, S22] }
  - { id: A10, statement: "amy tick on an empty queue discovers first and makes the move", proof: "deferred:assertion:errand.a_tick_discovers_before_it_moves", sources: [S23] }
  - { id: A11, statement: "amy remove <workflow> uninstalls it and, when told to, deletes its records and queue, and keeps them with --keep-state", proof: "deferred:test:packages/cli/tests/remove.test.ts", sources: [S25, S26] }
  - { id: A12, statement: "a price table older than seven days is refreshed by amy update, and a refresh that fails leaves it as it was", proof: "deferred:test:packages/cli/tests/models.test.ts", sources: [S28] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A1, A11, A12" }
  - { mechanism: calls, answer: n/a, why: "defineWorkflow only accepts three data members; how one workflow calls another is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "commands, checks and files are read beside register, not run around a plan" }
  - { mechanism: queue-and-store, answer: n/a, why: "look is poke renamed; claiming, recovery and pruning are unchanged" }
  - { mechanism: workflow-tooling, answer: n/a, why: "workflow rm folds into amy remove; amy workflow check and the testkit walk as before" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "file-worktree only gains the worktrees command over its own manager; no tree move changes" }
  - { mechanism: agent-replies, answer: n/a, why: "agent-relay only gains the models command; reading a reply is unchanged" }
guarantee:
  - { holds: "the built-in commands remain in index.ts: they are about the machine (queue, engine, install), not one process", not_against: "a plugin contributing a command of its own" }
  - { holds: "plugins still mount through register; commands, checks and files are read beside it, never through it", not_against: "a command declaring mount: true" }
  - { holds: "the core does not import commander: core types say what a command is, the CLI decides how it is parsed", not_against: "the CLI's own parser" }
failures:
  - { step: model price refresh, when: "the refresh fails", goes_to: "the table stays as it was, and it says so once" }
  - { step: "mount: true command", when: "the machine does not come up", goes_to: "refused, naming why" }
cut:
  - "letting a later plugin silently replace an earlier one's command, as Django does: refused; a command that changes with config order cannot be trusted"
  - "restricting commands to workflows: refused; any plugin, e.g. Linear shipping amy linear whoami instead of doctor growing it"
exit: "ticket-to-qa scenario, installed executable: --help lists the workflow's command, doctor runs its check, init writes its file. Errand: none exist, help lists only the machine's, tick discovers first. One start/stop pair toggles the machine; both gates require every assertion"
---
# A plugin brings its own commands

The command line is the host's alone, so it grows commands on every workflow's behalf: every install carries ticket-to-qa's roster. And of 27 commands, the daily operator uses one and cannot tell its neighbours apart.
