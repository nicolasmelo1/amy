# @amykit/cli

## 0.2.1

### Patch Changes

- e938103: Add the plan-board consistency check to the gate so delivered plans can move
  into durable design notes without losing their required assertions.
- @amykit/core@0.2.1
  - @amykit/model-specs@0.2.1
  - @amykit/workflow-ticket-to-qa@0.2.1
  - @amykit/plugin-file-log@0.2.1
  - @amykit/plugin-file-notes@0.2.1
  - @amykit/plugin-file-queue@0.2.1
  - @amykit/plugin-file-store@0.2.1
  - @amykit/plugin-file-tasks@0.2.1
  - @amykit/plugin-notify-hermes@0.2.1

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
- ec7c57e: Installing is `npm install -g @amykit/cli`, and `amy init` supplies the rest.
  
  Installing meant cloning the repository and running a shell script. That asks
  somebody to fetch a whole checkout to use a released product, and the script
  is POSIX, so Windows was not supported at all — for a tool whose entire job is
  to run unattended on whichever machine you leave it on.
  
  Now it is npm, which is the same three words on macOS, Linux and Windows, and
  npm's own shim puts `amy` on the PATH.
  
  The command still carries nothing but itself. A plugin resolves by name at run
  time, and a machine with no `codex` on it has no reason to hold the plugin
  that shells out to one — so what gets installed is what your config actually
  names, and `amy init` is what works that out:
  
  ```
  These are not installed yet:
    @amykit/plugin-linear
    @amykit/plugin-github
  
  Install them now? [Y/n]
  ```
  
  It asks rather than assuming, because installing into a global prefix is a
  change to the machine and not to amy. With nothing to ask on — a script, a
  pipe, CI — it prints the command instead of running it, and `--install` is how
  a pipeline says yes. `--no-install` keeps the old printing behaviour.
  
  What it offers is what the profile **will mount**, not what is recommended for
  it. That distinction is the bug this fixes as much as the ergonomics: a config
  naming `@acme/plugin-jira` is exactly the case worth installing, and a
  recommendation cannot know about a package this repository never shipped.
  
  Two failures it reports rather than leaves you to meet later: npm exiting
  non-zero, and npm exiting zero while the packages still do not resolve —
  usually a global prefix that is not the one amy is installed under, which
  would otherwise surface as a mount refusing by name on the first tick.
  
  `npm run install:local` stays, and is now what it always really was: how the
  gates prove an install works with no registry in the picture at all.
- 2b6bde3: `amy btw` — something said in passing becomes work.
  
  ```sh
  amy btw "bump the stale deps in the api package"
  ```
  
  The cheapest thing to lose is what somebody says while doing something else,
  and a ticket is the wrong shape for it: a ticket has an owner, a date and a
  conversation attached, and a sentence said in passing has none of those. amy
  had two ways in and neither fit — a ticket is work a tracker already knows
  about, a note is friction amy itself hit — so there was nowhere for *work
  somebody wants done that nobody will open a ticket for*.
  
  A third workflow, `@amykit/workflow-errand`, picks the task up, works in a branch
  of the repository it names, and either opens a pull request or comes back with
  an answer. **An errand that changed nothing is finished, not failed** — half
  of what people say in passing is "check whether X", which ends in a sentence.
  
  **Past a few in flight it holds and says so once.** Capturing costs nothing,
  and the failure that follows from that is thirty open pull requests nobody
  asked to review.
  
  `@amykit/plugin-file-tasks` keeps the tasks as a directory of markdown files, so
  an editor or a hook can add one too. `/amy-btw` is the skill: its job is
  turning what was said into a task that survives losing the conversation.
  
  It cost the core one action name — `run-errand`, the generic "ask the agent",
  which is now wanted by two workflows under names of their own. Nothing else
  changed: not the engine, not either other workflow.
- 1d89185: The version moves because a change said it should, and an installed package
  can say which one it is.
  
  Changesets owns the number, every `@amykit/*` package moves together through a
  `fixed` group, and the bump arrives as a pull request rather than as a commit
  somebody pushed. An installed package reads its identity out of a stamp
  written at pack time, and a tree with uncommitted changes gets no stamp at
  all — so `amy --version` says `dev` rather than naming a release that only
  existed on one laptop.

### Patch Changes

- b896045: Documentation that cannot go out of date, and a manifest a site can be built
  from.
  
  There was one 861-line README and twenty package READMEs, and nothing checked
  any of them against the code. A README is the cheapest thing in a repository to
  leave behind: nothing fails when it stops being true, and the day it matters is
  the day somebody is trying to write a plugin against a setting that no longer
  exists.
  
  `docs/` is now the documentation, in thirty-eight pages under eight groups, and
  **half of it is read out of the code on every build**. The commands come from
  the commander chain, the action catalogue and the port contracts from the
  source, the event kinds from the contract the log is already validated against,
  the `config.yaml` keys from the interface that defines them, the gates and
  rules from the policy — including the YAML comments, which is where the reason a
  rule is disabled actually lives.
  
  The interesting one is the plugins. Nothing declares "this plugin mounts the
  `tracker` port" in a manifest somebody keeps in step: **each plugin is
  registered against a registry that only takes notes, and asked.** A plugin that
  reads a credential at mount is handed a placeholder for exactly the variables
  its own source names, for the length of one call, never over a value already in
  the environment. So the reference tables say what the code does rather than what
  somebody last remembered to write.
  
  `npm run docs:check` is in `npm run gate`, and it names the file:
  
  ```
  docs: the code moved and the documentation did not. These are out of date:
    docs/reference/plugins.md
    plugins/file-queue/README.md
  ```
  
  Same promise `L3.GATE_HAS_FRESH_EVIDENCE` already makes about a gate's evidence.
  A block a page names and nothing produces is an error, and so is a block nothing
  places — a fact the documentation has and does not show is the same failure as
  one that is out of date.
  
  Every `packages/*/README.md` and `plugins/*/README.md` is generated from the
  package itself and says so in a banner. The root README is not, deliberately: it
  is the front door, it is argued rather than listed, and it went from 861 lines
  to 278 by linking rather than repeating.
  
  `docs/manifest.json` is one file a website reads instead of the repository — the
  navigation, every page with its front matter and headings, the full reference
  data, the catalogue and the news. It carries no timestamp, because a generated
  file that changes every time it is generated cannot be checked for drift.
  
  `npm run docs:changelog` caches the releases GitHub holds, so the news page
  exists without the build ever needing a network. And `npm run docs:draft` — the
  one part that is not deterministic and is deliberately outside the gate — has no
  HTTP client of its own: it mounts amy's own harness plugins through `mount()`
  and asks through the `agent` port, so a draft climbs the same ladder, under the
  same ceiling, into the same log as everything else. A plugin model that only
  works for the engine it was written for does not work.
- b53de08: The config `amy init` writes is one this build can read, and it names every
  setting there is.
  
  Two failures, both shipped, both caught by the same check.
  
  The loud one: the template carried `agent:` twice. YAML refuses a duplicate key
  rather than merging it, so `amy init` wrote a file `loadConfig` threw on and
  the next command anybody ran died. No test had ever parsed the template — only
  the roster beside it.
  
  The quiet one: `pollBackoffMs` was configurable for its whole life and appeared
  nowhere, so the only way to find it was to read the source. `staleClaimMs`,
  `maxItemAttempts`, `maxDraftAttempts` and the whole `errands` block were the
  same. A setting nobody can discover is a setting that does not exist, and the
  cost lands on whoever concludes the machine cannot do what it does.
  
  `checkConfigTemplate` now parses the template, refuses a key nothing reads, and
  refuses a setting the template never names. Named is enough — a setting
  commented out with the reason is documented. It runs in the gate and in CI, and
  `L2.DERIVED_ARTIFACTS_MATCH_THEIR_SOURCE` points at it: the template is derived
  from the settings the loader merges over, by hand, which is why it drifted
  twice without anybody noticing.
- eeba3e5: The release workflow stays dormant until `AMY_RELEASE` is set.
  
  The first release is deliberately later, and an unarmed release job failed on
  every push to main: GitHub refuses to let Actions open a pull request unless
  that is switched on, and there is no npm token behind it yet either. Both are
  real preconditions, and neither is a reason for main to be red in the
  meantime.
- 6c0a1ee: The release workflow calls the changesets action by the names it actually
  has. Its inputs were renamed in v2 and the old ones are a hard error, so the
  first run on main stopped before doing anything — which is the failure mode
  to want.
- ae1a7d8: The version bump regenerates the documentation, so the release can pass its
  own gate.
  
  A release moves two things the generated documentation is derived from: every
  package's version, which `docs/manifest.json` carries, and the pending
  changesets, which `changeset version` consumes into changelogs.
  
  So the "Version packages" pull request was the one pull request in this
  repository that could never be green — the drift check would report
  `docs/manifest.json` and `docs/changelog/index.md` as stale, correctly, and
  there was no way to fix it by hand that the next bump would not undo.
  
  `release:version` now ends in `npm run docs:generate`. Beyond the gate, it
  means the news page ships *with* the release rather than after it: by the time
  the version pull request is reviewed, "Coming next" is empty and the changelogs
  it describes exist.
  
  The released half still cannot write itself, because a GitHub release does not
  exist until the publish has happened. `npm run docs:changelog` after a release
  is what fills it, and until it runs the page says so rather than showing
  nothing.
- 13c950c: amy says what it is, rather than what its first workflow does.
  
  The description was "Drives a work ticket from in-progress to QA handoff" —
  which is one of the three workflows in the box, not the product. What amy is
  is the machine underneath: a state machine you leave running, where the core
  owns the actions and everything else — the workflow, the engine, the tracker,
  the forge, the agent, every notification channel — is a plugin you assemble
  for the work you actually do.
  
  And it runs *under* the harnesses rather than inside one. Claude Code, Codex,
  Hermes and a terminal are doors into the same install, which keeps its state
  when any of them closes.
- Updated dependencies [d551e5b]
- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/model-specs@0.2.0
  - @amykit/plugin-file-notes@0.2.0
  - @amykit/core@0.2.0
  - @amykit/plugin-file-log@0.2.0
  - @amykit/workflow-ticket-to-qa@0.2.0
  - @amykit/plugin-file-queue@0.2.0
  - @amykit/plugin-file-store@0.2.0
  - @amykit/plugin-file-tasks@0.2.0
  - @amykit/plugin-notify-hermes@0.2.0
