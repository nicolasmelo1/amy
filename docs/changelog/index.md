---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### **A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.

`minor` · `@amykit/agent-kit`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-file-worktree`, `@amykit/plugin-notify-fanout`, `@amykit/plugin-prove`, `@amykit/plugin-slack`, `@amykit/plugin-telegram`, `@amykit/plugin-terminal-conversation`, `@amykit/workflow-errand`, `@amykit/workflow-feature-grooming`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-testkit`, `@amykit/workflow-ticket-to-qa`

- **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
- **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
- **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
- **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
- **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
- **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.

### **A skill is asked for in the chat.** Grooming needed a terminal: amy's skills lived only in a harness's own directory, and the chat knew three commands. Now `/amy-groom TBO-1` works from Slack or Telegram, and the thread goes on.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-claude`, `@amykit/plugin-codex`

- **amy owns a copy of the skills it ships.** `amy skills` and every `amy
  update` write every shipped skill into `~/.amy/skills`, whether or not a
  harness directory was chosen; a harness's own directory stays an extra the
  person asks for. A root amy cannot write is a failed install naming it.
- **A step looks a skill up in a fixed order.** `~/.amy/skills` first, then the
  roots the config names. `~/.claude/skills` is no longer looked in on its own:
  a harness's skills reach amy only through `harnessSkills`. The relay and the
  chat read the same order, so a skill the mount accepted is the one handed to
  the harness.
- **A harness's own skills are linked, never copied.** `harnessSkills: {
  claude: true }`, top-level in `.amy/config.yaml` or under the relay's own
  settings (which win), links each skill of that harness into `~/.amy/skills`,
  one symlink per skill, at every `amy run`, `amy tick` and loop pass. `false`,
  or leaving the harness out, removes the links; amy's own copy of a skill wins
  over a link. The names are the harness plugins that mounted: the `Harness`
  port gains `skillsDirectory`, which claude (`~/.claude/skills`) and codex
  (under `CODEX_HOME` or `~/.codex`) report, and a name no harness plugin
  mounted is refused at boot.
- **The conversation is a step in the skills ladder.** `skills: { chat:
  [/amy-groom] }` mounts, a chat skill that is not installed is refused at boot
  naming it and what is installed, and no other vocabulary names what the chat
  may run.
- **A message that starts with a skill is an `/action` turn.** After a leading
  space or a bot's name, `/amy-groom <ticket>` is answered with the skill lent
  to the harness and its commands run; the thread keeps the skill until `/new`.
  A `/skill` the ladder does not name is answered with the ones it does, and
  nothing runs. The harness stays read-only in a skill turn: what acts is the
  `/action` list.
- **A section with newlines arrives as a block, never a shell.** `brief
  sections --json` and `brief check --json` are read from the chat, and `brief
  write` takes `--explains` and `--from answer.md`, the fenced block in the
  same answer. The chat checks the block is there before anything runs, writes
  it to a file for the length of the command, and removes it after. `amy brief
  write` takes `--from <file>` too, so the same spelling works in a terminal.
- **A skill turn needs a harness that can be handed one.** The `Harness` port
  gains `lendsSkill`, which claude sets: a chat addressed to a skill on a
  harness that cannot load it is refused, naming one that can, rather than
  acting without the method.
- **The chat reads its ladder and its skills as the mount does.** A ladder
  written under the relay's own settings wins, as the operator's slice does at
  mount; the skill table is resolved every pass, so installing or deleting a
  skill needs no restart. `/new` in a thread ends the skill it was started
  with. `amy update` writes the skills on every successful run, moved or not,
  and `amy skills --recorded` leaves the own-root write inside `writeSkills`'
  rollback so a failed move restores the previous bodies. The skills are
  written before the boot check, so a deleted `~/.amy/skills` a chat skill
  needs is repaired by the update, and a moved CLI that does not boot has the
  rolled-back one write its own skills back.
- **A skill turn checks its skill is still there.** A turn queued behind one
  whose commands removed the skill is refused, naming `amy skills`, rather than
  lent a directory that is gone. A block fenced with more backticks holds a
  three-backtick example whole, and a block that cannot be written leaves the
  turn to be asked again rather than settled.

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).
