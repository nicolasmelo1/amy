# @amykit/agent-kit

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/workflow-ticket-to-qa@0.3.1

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
- a0ec22e: The settings `amy init` writes assemble into a machine that boots — and the
  check that says so runs from the gate, not from a memory of a real install.
  
  `EXAMPLE_CONFIG` shipped `claude:opus` in the default ladder and again in a
  step's own. `everyLadderEntry` unions the default ladder with every per-step
  one and does not dedupe, so `tiersFor` produced `["sonnet", "opus", "haiku",
  "opus"]`, `contributeTiers` contributed a second agent named `claude:opus`, and
  the second one met the collection's one-name rule at mount. `amy init` wrote a
  config its own first `amy doctor` refused, and the workaround — deleting the
  per-step ladder the template exists to teach — configured the feature out of
  an install because of a missing `Set`.
  
  The union dedupes in one place, `contributeTiers`, preserving first-seen
  order: a ladder is ordered and the first mention is the one that means
  something.
  
  And the template check grows the claim it was always about: `npm run
  check:config` now assembles the settings the template ships — the same `load`,
  the same `pluginList`, the same `mount` a real boot runs — and refuses a
  template whose machine does not start.
  
  Nothing being installed by default, the template's `workflows:` block is a
  commented example, so the check mounts the settings under the workflow that
  example names: the machine the operator has one uncomment later. That is where
  the ladder, the budget, the gate and the skills actually meet a `mount`, and
  where the duplicate rung hid. The transcription is the one thing that can go
  stale, so a template that stops offering the example it copied turns the check
  red rather than leaving it mounting something nobody is offered.
  
  The unit tests prove every direction: the shipped example mounts, the check
  leaves the environment as it found it, and a template whose budget window
  nothing meters, whose ladder names a harness nothing contributes, or which
  renames the example out from under the transcription, turns the check red.
  
  The relay's gate carries the proof: `relay.a_rung_named_twice_mounts_once`
  mounts the template's own ladder shape against the built plugins, and
  `relay.the_first_mention_sets_the_order` walks a step onto the rung its
  step's ladder names first.

### Patch Changes

- Updated dependencies [e603b3b]
- Updated dependencies [7ec6c02]
  - @amykit/core@0.3.0
  - @amykit/workflow-ticket-to-qa@0.3.0

## 0.2.0

### Minor Changes

- e955a7d: A ladder per step, so the cheap step can reach a cheap model.
  
  One ladder for the whole install was the right default and the wrong ceiling.
  Reading a ticket to decide whether it is clear enough to start is not the same
  job as writing the change, and putting both behind one list means paying the
  expensive model to do the cheap step, or asking the cheap one to do the work.
  
  ```yaml
  agent:
    ladder: [claude:sonnet, claude:opus]
    ladderByStep:
      triage: [claude:haiku]
      implement: [claude:opus]
  ```
  
  Keyed by the workflow's action name, which the relay already had in hand for
  choosing a skill — so this is a lookup where there was an array, not new
  plumbing. A step that names no ladder uses the one above it, and so does an
  install that sets none, which is every install today.
  
  **Which is what makes routing by difficulty possible without anything here
  learning the word.** A workflow that triages into easy and hard emits
  different actions for each, and the config points them at different rungs. The
  relay never finds out what "hard" means.
  
  The two ladders stay separate concerns: a step picks one, and the failure
  ladder is then climbed *inside* it. Falling back to the default when a rung
  fails would mean an operator who asked for a cheap model got the expensive one
  every time the cheap one wobbled.
  
  A name inside `ladderByStep` mounts its harness and contributes its model tier
  exactly as a name in `ladder` does. Reading only the default would have refused
  that mount at boot — correctly, but for a reason nobody could see from the
  config they wrote.

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
  - @amykit/workflow-ticket-to-qa@0.2.0
