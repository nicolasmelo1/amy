---
"@amy/cli": minor
"@amy/model-specs": minor
"@amy/plugin-file-notes": patch
---

amy is one install per machine, and it stays running.

**State moved to `~/.amy`.** It used to live in `./.amy`, so `amy status`
answered differently depending on where you were standing — and the wrong
answer was "nothing tracked yet". amy drives work in checkouts all over the
disk and is reached from whichever harness you are in, so it cannot be
per-directory. `AMY_HOME` overrides. **State left in a working directory is
reported by `amy doctor` and never adopted**, because picking it up silently
would restore the behaviour being removed.

**`amy start` and `amy stop` are the loop.** `start` runs it in the background
with `--every <seconds>`, outliving the terminal that started it; `stop` ends
it. `amy status` says whether it is up and since when.

**`amy pause` and `amy resume` are the handbrake**, which is what `stop` and
`start` used to be. Pausing ends work in flight and starts nothing new while
the loop stays up. It survives a reboot because it is a file; the loop does
not, because it is a process.

**`amy workflow list` and `amy workflow rm`.** `rm` deletes a profile's
records, its queue and its config entry, and prints what it would do unless
given `--yes`. It never touches the log, which is append-only because the
budget is measured off it.

**`amy skills`** installs amy's skills into every harness it finds — Claude
Code and Hermes today — rather than into one project. They ship inside
`@amy/cli` so they cannot drift from the amy that ships them. Three new ones:
`/amy-init`, `/amy-show-me`, `/amy-status`, and `/amy-workflow` is now an
interrogation that redraws the workflow after every answer.

Changing amy's own codebase is not one of them: that is what `CONTRIBUTING.md`
is for. A skill describing a repository the reader does not have is noise in
the list an agent reads when deciding what to reach for.

**`amy status --json`** for something else to render.

Fixed: a hand-written plugin slice replaced the derived one instead of merging
with it, so a config that set `retentionDays` on the queue lost the
`directory` beside it — and two profiles quietly shared one queue, each
claiming the other's work.

`specTable()` now takes the state directory rather than a working directory,
and `OVERRIDE_PATH` becomes `OVERRIDE_FILE`.
