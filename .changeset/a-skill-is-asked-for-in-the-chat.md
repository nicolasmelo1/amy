---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/plugin-agent-relay": minor
"@amykit/plugin-claude": minor
---

**A skill is asked for in the chat.** Grooming needed a terminal: amy's skills
lived only in a harness's own directory, and the chat knew three commands. Now
`/amy-groom TBO-1` works from Slack or Telegram, and the thread goes on.

- **amy owns a copy of the skills it ships.** `amy skills` and every `amy
  update` write every shipped skill into `~/.amy/skills`, whether or not a
  harness directory was chosen; a harness's own directory stays an extra the
  person asks for. A root amy cannot write is a failed install naming it.
- **A step looks a skill up in a fixed order.** `~/.amy/skills` first, then the
  roots the config names, then `~/.claude/skills`. The relay and the chat read
  the same order from one function, so a skill the mount accepted is the one
  handed to the harness.
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
  rollback so a failed move restores the previous bodies.
