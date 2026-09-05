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

### A ladder per step, so the cheap step can reach a cheap model.

`minor` · `@amykit/agent-kit`

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

### amy is one install per machine, and it stays running.

`minor` · `@amykit/cli`, `@amykit/model-specs`, `@amykit/plugin-file-notes`

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

### A workflow is a name in a config, and a plugin is installed rather than compiled in.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-file-log`, `@amykit/plugin-file-notes`

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

### Documentation that cannot go out of date, and a manifest a site can be built from.

`patch` · `@amykit/cli`

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

### Friction becomes a plan, and the queue stops needing a ticket.

`minor` · `@amykit/core`

Two contracts move into the core, because neither of them ever named a domain.
`CodeHost` and the pull request view it returns — a repository, a branch, a
login — leave `@amykit/workflow-ticket-to-qa`, so one mounted `@amykit/plugin-github`
now serves any workflow. `Harness` joins them: a prompt, a directory, and an
account of what the answer cost. The harness plugins contribute the bare CLI
alongside their ticket-shaped agent, and `@amykit/plugin-agent-relay` mounts both
halves behind the one `agent` port, so a second workflow's own prompts climb
the same ladder, under the same ceiling, in the same log.

`@amykit/workflow-note-to-plan` is that second workflow, and it is the proof the
plugin model was waiting for: it runs on `@amykit/plugin-serial-engine`
unmodified. Going through the seam found one defect in it — every workflow
runtime re-ran `applyPlan`, which the engine had already run, so every retry
was counted twice and every move wrote a transition from a state to itself. A
ceiling of three implement attempts was really one and a half. Fixed, and both
end-to-end scenarios still pass unchanged.

For anyone driving this from a config: `@amykit/plugin-file-queue` and
`@amykit/plugin-file-store` gained a `directory` setting, so two workflows can
share one `.amy` without reading each other's work. `Announcement` gained an
optional `kind` — `failing`, `gave-up` or `recovered` — so a channel can tell
a step that failed once from a machine that has stopped.

For anyone typing at it: `amy note "..."` writes a piece of friction down and
queues it, `.amy/notes/` is watched for the longer ones, and
`amy --workflow note-to-plan tick` drives them to a pull request adding a plan
to the repository the friction is about. Nothing in that path touches a
tracker.

### Installing is `npm install -g @amykit/cli`, and `amy init` supplies the rest.

`minor` · `@amykit/cli`

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

### One adapter for every command line tool, instead of one plugin each.

`minor` · `@amykit/core`

`@amykit/plugin-command` mounts a `commands` port and a `run-command` action. A
workflow asks for a command *by name*; the config is the only place that says
what that name runs:

```yaml
plugins:
  "@amykit/plugin-command":
    allow:
      datadog: pup monitors list --json
      notion: ntn page get
```

That split is the security model. A command line assembled from a ticket body,
an agent's answer or a file somebody dropped in a directory would be a machine
that runs whatever a stranger can type into an issue — and this one reads
issues for a living. Arguments are passed as positional parameters
(`sh -c 'pup "$@"' sh --since 1h`), so an argument carrying a semicolon is an
argument.

It was made general by evidence rather than guess: `@amykit/plugin-command-gate`
and `@amykit/plugin-plan-check` were already the same shape twice.

### `amy btw` — something said in passing becomes work.

`minor` · `@amykit/cli`, `@amykit/core`

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

### The engine drives a workflow it does not know.

`minor` · `@amykit/core`

`WorkflowRuntime` is new in the core: what a workflow contributes so that
something else can run it — how to find work, what the world looks like, one
handler per action, and the fold only the workflow can do. The serial engine
takes one and keeps the half that names nothing: the queue, the attempt
counts, the budget and the handbrake.

For anyone driving this from a config: `repos`, `qaStatusName` and `policy`
moved from the engine's settings slice to the workflow's, and the engine
gained `retryDelayMs` of its own. `amy` maps both for you; a hand-written
`plugins:` slice needs the two keys moved.

### The version moves because a change said it should, and an installed package can say which one it is.

`minor` · `@amykit/cli`

Changesets owns the number, every `@amykit/*` package moves together through a
`fixed` group, and the bump arrives as a pull request rather than as a commit
somebody pushed. An installed package reads its identity out of a stamp
written at pack time, and a tree with uncommitted changes gets no stamp at
all — so `amy --version` says `dev` rather than naming a release that only
existed on one laptop.

### The release workflow stays dormant until `AMY_RELEASE` is set.

`patch` · `@amykit/cli`

The first release is deliberately later, and an unarmed release job failed on
every push to main: GitHub refuses to let Actions open a pull request unless
that is switched on, and there is no npm token behind it yet either. Both are
real preconditions, and neither is a reason for main to be red in the
meantime.

### The release workflow calls the changesets action by the names it actually has. Its inputs were renamed in v2 and the old ones are a hard error, so the first run on main stopped before doing anything — which is the failure mode to want.

`patch` · `@amykit/cli`



### A pull request carries its URL, an errand opens its own as a draft, and the tests are type-checked.

`minor` · `@amykit/core`, `@amykit/plugin-github`

`PullRequestView` gains `url`, and `OpenPullRequestRequest` gains `draft`.
The errand workflow opens as a draft — nobody asked for that work at the
moment it landed, and work somebody is waiting on is not a draft — and
announces the link rather than the number, because that announcement is read
on a phone more often than anywhere else and a number is a thing you have to
go and look up.

Adding a required field is what turned up the rest: **nothing type-checked the
test files.** `tsc --build` compiles `src` only, and vitest strips types
without checking them, so a test could name a field that does not exist and
stay green. `npm run typecheck` now covers them, in the gate and in CI.

It found 45 errors on the first run. Most were harmless drift, three were not:

- The ticket workflow's walkthrough — the most important test here — typed its
  effects parameter off `effectsOf`, **a name that does not exist**. TypeScript
  never saw it because the reference was in type position and esbuild strips
  those, so the whole `switch` over the workflow's effects was unchecked.
  Adding an effect would not have failed it.
- `@amykit/plugin-agent-relay`'s doubles returned `{ kind: "clear" }` for a
  `TriageOutcome` that has been `{ clear, questions, at }` for a while, and a
  `NamedAgent` with no `using`, which is the method the skill ladder calls.
- Six engine test builders typed their overrides as the engine's own deps
  rather than the ticket fixture's, so every option they accepted was one the
  type said could not be passed.

### The version bump regenerates the documentation, so the release can pass its own gate.

`patch` · `@amykit/cli`

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

### amy says what it is, rather than what its first workflow does.

`patch` · `@amykit/cli`

The description was "Drives a work ticket from in-progress to QA handoff" —
which is one of the three workflows in the box, not the product. What amy is
is the machine underneath: a state machine you leave running, where the core
owns the actions and everything else — the workflow, the engine, the tracker,
the forge, the agent, every notification channel — is a plugin you assemble
for the work you actually do.

And it runs *under* the harnesses rather than inside one. Claude Code, Codex,
Hermes and a terminal are doors into the same install, which keeps its state
when any of them closes.

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
