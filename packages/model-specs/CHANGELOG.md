# @amykit/model-specs

## 0.3.0

### Minor Changes

- e603b3b: Refuse a dollar ceiling that cannot stop anything, and ask the harness rather
  than the price table.
  
  `specs.json` had no row for the Claude 5 family, so a run whose harness did not
  report a cost of its own was recorded with none, `spend.costUsd` never moved
  for it, and `amy budget` reported a figure that was arithmetically true and
  practically a lie. The table now prices `claude-opus-5`, `claude-sonnet-5`,
  `claude-opus-4-8`, `claude-sonnet-4-6` and `claude-fable-5-1`, declares the
  short names a harness CLI accepts (`opus`, `sonnet`, `haiku`, `fable`) so a
  ladder written in them can be recognised, and adds `gpt-5.3-codex` and
  `gpt-5.3-codex-spark`. A refresh keeps the aliases and the long-context
  tiering, because models.dev carries neither.
  
  A price table always lags, so the lasting half is that the ceiling knows: a
  `costUsd` ceiling is refused at boot when a rung in any ladder — including a
  step's own — names a model whose cost nobody could work out, naming the model
  and the rung.
  
  **Whose cost nobody could work out is not the same question as whose model is
  in the table**, and conflating the two is the reason this is one change rather
  than two. A rung now declares whether its harness accounts for itself
  (`Rung.pricesItsOwnRuns`), and only a rung that does not is measured against
  the table:
  
  - **claude** puts `total_cost_usd` in its envelope, and a cost the harness
    reported beats anything a table computes.
  - **hermes** writes `cost_status: "included"` for a run a subscription or a
    local model covered — where zero is the right answer rather than a missing
    one, and no price list will ever publish a rate for a model running on
    somebody's own machine — and prices the rest of its providers itself.
  - **codex** reports no cost of its own, so the vendored table is the only way
    one of its runs gets a price. It is the one harness a missing row leaves a
    dollar ceiling inert for.
  
  Reading the table's answer as the whole question would refuse an install whose
  ceiling works perfectly well, which is the same failure as an inert ceiling
  reached from the other side: a machine that will not start over a number it
  already has.
  
  The refusal also no longer offers a command that could not fix it.
  `amy models refresh` re-rates the models the table already has and never adds
  one, so a model with no row at all is told to get one in
  `.amy/model-specs.json`, or a ceiling in tokens. `amy budget` says the same.
  
  **Breaking for one config shape:** `ladder: [codex]` — a codex install naming
  no model — is now refused under a `costUsd` ceiling, because there is no id to
  price it by and codex reports nothing to price it with. Name the model
  (`codex:gpt-5`) or set the ceiling in tokens.

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0

## 0.2.0

### Minor Changes

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

### Patch Changes

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
