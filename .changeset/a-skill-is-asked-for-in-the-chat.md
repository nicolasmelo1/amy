---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/plugin-agent-relay": minor
"@amykit/plugin-claude": minor
"@amykit/plugin-codex": minor
---

**A skill is asked for in the chat.** Grooming needed a terminal: amy's skills
lived only in a harness's own directory, and the chat knew three commands. Now
`/amy-groom TBO-1` works from Slack or Telegram, and the thread goes on.

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
