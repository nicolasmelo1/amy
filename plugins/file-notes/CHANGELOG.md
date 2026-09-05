# @amykit/plugin-file-notes

## 0.2.0

### Patch Changes

- d551e5b: amy is one install per machine, and it stays running.
  
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
  `@amykit/cli` so they cannot drift from the amy that ships them. Three new ones:
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
- f9944f6: A workflow is a name in a config, and a plugin is installed rather than
  compiled in.
  
  `--workflow` used to accept two literals, so an install could not drive a
  workflow this repository had not shipped — while the engine underneath it
  could drive anything. A profile is now an entry under `workflows:` in
  `.amy/config.yaml`: a name, the package that drives it, and optionally the
  plugins to mount under it. The two shipped ones are what a config with no
  such block gets.
  
  Each profile keeps its records and queue under `.amy/<name>/`, so a second
  workflow no longer writes over the first's state. **State from an older
  install stays where it was**: `amy doctor` names each directory it found and
  the one `mv` that moves it.
  
  The loader's table of literal imports is gone with the compiled binary. What
  installs is packages, resolved by name at run time, so a machine carries the
  plugins it uses and nothing else — `AMY_PACKAGES` takes the subset. A plugin
  named and not installed is refused at boot with the list of what is, and
  `amy plugin list` reports installed and mounted as the different questions
  they are.
  
  `@amykit/cli` therefore stops depending on ten plugins it never imported, and
  `amy init` prints the `npm install` line for whatever a configured workflow
  needs and this machine does not have.
- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/core@0.2.0
  - @amykit/plugin-notify-fanout@0.2.0
