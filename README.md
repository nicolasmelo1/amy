# amy

**A**utomate **MY** work.

**Drives a work ticket from in-progress to QA handoff, one deterministic move at a time.**

---

## Why this exists

Implementing a ticket is the part an agent is already good at. The work around
it is not hard, it is just long: read the ticket, ask if something is
ambiguous, implement, check, open a pull request, deal with the bot reviewer,
pick a human reviewer, deal with them, ask when you disagree, hand it to QA.

That loop is *cyclic* and it *waits on other people for days*. Neither fits a
task DAG, so it does not belong inside a task runner. It belongs in a state
machine that persists, resumes, and only ever makes one move at a time.

`amy` is that machine. The agent is called in four places. Everything else
is a predicate over the tracker and the code host.

---

## The machine

```text
DISCOVERED ──► CLARIFYING ──► READY ──► IMPLEMENTING ──► CHECKED ──► PR_OPEN
                   ▲                        ▲               │            │
                   │                        └───────────────┘            │
                   │                          gate is red                │
                   │                                                      ▼
                   │                                              COPILOT_WAIT
                   │                                                 │      ▲
                   │                                                 ▼      │
                   │                                            COPILOT_FIX ┘
                   │                                                 │
                   │                                                 ▼
                   │                                        REVIEWER_ASSIGNED
                   │                                                 │
                   │                                                 ▼
                   │        ┌───────────────────────────────► HUMAN_REVIEW ◄──┐
                   │        │                                    │      │      │
                   │        │                        approved ◄──┘      ▼      │
                   │        │                            │         HUMAN_FIX   │
                   │        │                            │          │     │    │
                   │     ESCALATED ◄────────────────────────────────┘     ▼    │
                   │        │              disagreed                  RE_REVIEW
                   │        └──► HUMAN_FIX                                 │
                   │                                                        ┘
                   │                                    APPROVED ──► QA_HANDOFF ──► DONE
```

Four of those states are waiting states: `CLARIFYING`, `COPILOT_WAIT`,
`HUMAN_REVIEW` and `ESCALATED`. In those the machine has nothing to do until
somebody else moves, so it backs off instead of spinning.

## The decision is a pure function

```ts
plan(record, observation, policy): Plan
```

It reads a persisted record and a snapshot of the outside world, and returns
one of four things: `act` (do work, stay put, look again straight away),
`advance` (move, with one-shot effects), `wait` (back off), or `settled`.

It touches no tracker, no code host, no repository and no agent. That is why
the whole lifecycle can be walked end to end in a test with no I/O at all,
including the paths where a review requests changes and where the agent
disagrees with a reviewer.

Effects are only ever *described* by the machine and *executed* by the worker,
so what the machine decided and what the world did stay separable.

## The queue is the schedule

There is no interval anywhere in this repository.

A ticket's next look is enqueued by the look that precedes it. A step that
takes a minute and a step that takes an hour both chain the instant they
finish, rather than waiting for a tick that might be twenty minutes away.
Waiting states enqueue themselves with a delay, which is the only place a
duration appears at all.

The queue is a directory of one file per item. Claiming renames the file into
`running/`, and rename is atomic on one filesystem, so two workers cannot take
the same item. Items abandoned by a dead worker are returned by `recover`, and
finished items are pruned on the way past so the directory does not grow
forever.

---

## It fails out loud

<!-- claim: ENGINE_FAILS_OUT_LOUD proven-by: plugin-serial-engine -->
The GitHub API will go down and Claude will go away, and there is no graceful
shutdown here. When a dependency goes down you get **one** warning on the way
down, silence while it is down, and **one** warning when it comes back — and
the ticket resumes the move it was going to make, from the state it was in.

Which means the number that used to mean "how many failures before you are
told" now means "how many before the machine gives up", and being told
happens on the first one.

A notification channel you misconfigured never costs a ticket a move, and
neither does a log directory you cannot write to. The line is one question:
**a port call may only be swallowed when its failure does not make the saved
record a lie.** The notifier and the event log are the only two that qualify;
the tracker, the code host, the agent and the gate all still fail the tick.

The log those warnings go into is a versioned contract.
`packages/core/events.json` declares every kind, what each line says, and the
shape of its `detail`; a validator compares the declaration against what is
written, and the file is hash-locked, so renaming a kind cannot happen without
a reviewer seeing it.

---

## Things that look obvious and are wrong

Each of these was checked against a real tracker and real pull requests, and
each one is enforced by a test.

**The working status has to be matched by name, not by category.** The tracker
files In Review, In QA, Ready To Release and Triage Review under the same
`started` category as In Progress. Matching the category picks up work that is
already past implementation.

**The bot reviewer posts a review even when it found nothing.** So "has
reviewed" is not a useful signal and neither is "has no open threads". The
machine asks whether the bot has reviewed *the current head*, which is the
only question with a stable answer.

**The bot answers to three different logins.** `copilot-pull-request-reviewer[bot]`
on REST reviews, `Copilot` on REST review comments, and
`copilot-pull-request-reviewer` on GraphQL. One function decides what counts.

**Review load has to be counted across every repository.** Counting one sends
every review to whoever happens to be quiet in that one.

**The branch name comes from the tracker.** It owns the slug and truncates long
titles its own way. A locally derived branch breaks the tracker's automatic
pull request linking.

**A roster goes stale silently.** People go on leave without editing a config
file, and a review assigned to somebody who is away stalls for days with
nothing looking broken. So the roster carries `confirmedOn`, and on a workday
the machine refuses to assign anybody while it is not today. It does not ask
at the weekend, because nobody is there to answer.

**An implementation has to be dated against the gate.** Without that check a
red gate bounces back to the agent, finds the previous successful attempt
still recorded, and goes straight back to the gate forever.

---

## Everything is a plugin

The core owns no domain. It owns the **catalogue of actions** that can be
taken, how each one is dispatched, the generic work record, the plan, and the
registry that mounts everything else. A state is a string to it and an action
is a name.

**A workflow is only the order in which actions happen, plus how they run.**
It does not define actions: a second workflow that needs `implement` reuses
the one the core ships rather than dragging a whole domain along with it. A
new action goes into the core.

```text
@amy/core
  actions:  triage, implement, run-gate, open-pull-request, address-threads,
            assign-reviewer, request-rereview, escalate, hand-off-to-qa,
            announce                    each declares the port it needs
  contract: Workflow + WorkflowRuntime  what an engine drives, generically
      ▲                                          ▲
      │ composes actions                         │ implements ports
      │                                          │
@amy/workflow-ticket-to-qa              @amy/plugin-linear       tracker
  the sixteen states, a pure plan(),    @amy/plugin-github       code-host
  its typed port contracts, and the     @amy/plugin-claude       agent
  runtime that runs its actions         @amy/plugin-command-gate gate
      │                                 @amy/plugin-notify-* notifier
      │ contributes a runtime           @amy/plugin-file-queue   queue
      ▼                                 @amy/plugin-file-store   store
@amy/plugin-serial-engine
  a queue, a budget, a retry count and a stop switch — and no idea what a
  ticket is
```

**The engine drives a workflow it does not know.** It asks the workflow what
to do next, asks the *runtime* the workflow contributed to do it, and holds
the queue, the attempt counts, the budget and the handbrake in between. Every
noun in `Worker.ts` is one of those; a ticket, a pull request and a reviewer
appear nowhere in it. So a second workflow over a different domain — the one
[the roadmap](plans/the-roadmap.md) wants for ARC — costs a `plan()` and a
runtime, not a fork of the engine.

Plugins are **loaded from the config and assembled**, not constructed by the
CLI. `mount()` refuses, at boot and by name, a plugin that will not import, a
setting that is not one it declared, two plugins claiming the same port, and
an action the workflow emits that nothing can run. Removing the agent plugin
does not produce a crash three layers deep; it produces three lines naming
the three actions that would have failed.

Several plugins can add to one **collection** that another consumes, which is
how the notification channels reach the fan-out without the core learning the
word "channel". A collection is read when it is used, not when it is mounted,
so the order plugins are listed in does not matter.

A plugin may register an action the core does not have, and when it does it
has to bring the port that runs it in the same package. The pair is
inseparable on purpose: an action nobody can execute is a promise the machine
cannot keep. If such an action proves general it graduates into the core, by
evidence rather than guess.

### The logic is code, the reach is data

`plan()` is a pure function, so a predicate like "the bot reviewed this head
and no thread is outstanding" can be written directly instead of encoded in
some condition language.

What is declared as *data* is the workflow's **reach**: `usesActions` and
`usesObservers`. That is what lets the engine answer, before touching a
ticket, whether every action the workflow can emit has something that runs it:

```ts
worker.missingActions(workflow.usesActions)   // [] or the names that would fail
```

An action name that nothing handles is a boot-time error, not a surprise
halfway through somebody's ticket. It is also the surface Logion can measure
without anybody reading the logic.

### Where the types live

The core is generic on purpose, so type safety comes from the other side: the
workflow package declares and exports `Ticket`, `PullRequestView`, `Roster`
and its own record, and the adapter packages import those from it. The cast
between a typed ticket record and the core's generic one lives at one
boundary, in `ticketToQa`, rather than being spread around.

Nothing reaches the outside world except through `CommandRunner` or
`GraphQLClient`, which is why every adapter is tested against a scripted
answer instead of the real `gh`, `claude`, `git` or API.

## Installing it

This repository is the source. What runs is a single executable installed
somewhere on your `PATH`:

```sh
npm run install:local     # builds with bun, installs to ~/.local/bin/amy
amy --version             # 0.1.0 (83ef192, built 2026-09-03T20:28:44Z)
```

Two reasons it works this way, and neither is convenience.

**The code under test should be the code that ships.** Every unit test here
imports a source file from inside the workspace, so a build that carries no
plugins at all passes all of them. That is not hypothetical: it is what a
bundler produces from a dynamic `import(spec)`, and it is why the loader keeps
a table of literal imports and why there is a gate that runs the installed
binary from a directory with no checkout in it.

**Your working directory should not be a repository.** amy works on tickets
that name real colleagues and real customers. If the program doing that work
runs inside a git repository, every accident that drops a file in the working
directory is one `git add -A` away from being published.

Every line amy writes to the log names the build that wrote it. Running from
source stamps `dev`, because that is the truth: it was not a build.

## Setting it up

```sh
amy init                  # write the config and roster templates
# edit .amy/config.yaml and .amy/roster.yaml
cp .env.example .env          # then put your Linear key in it
amy roster confirm        # stamp today's date
amy doctor                # check every dependency before it touches a ticket
```

The Linear personal API key comes from Settings, Security and access. It is
read from `.env` in the working directory, which is gitignored. Anything
already exported in the shell wins over the file, so overriding it for one
command stays reliable.

`amy doctor` is worth running first. It checks the config, the roster's
freshness, the API key, `gh`, `claude` and `git`, the Hermes target, and that
every configured repository is actually checked out.

## Running it

```sh
amy discover         # put in-progress tickets on the queue
amy run              # keep advancing until nothing is due
amy status           # where every ticket stands, and what is waiting on you
amy tick             # exactly one move, for watching or debugging
amy queue prune      # drop finished items past their retention
amy queue recover    # return items a dead worker left claimed
amy roster confirm   # every workday, before it will assign anybody
amy budget           # what the agents have spent, against the ceiling
```

## Who does each step

The agent is called in four places, and by default each call is amy asking in
its own words. A step can be handed to a named skill instead:

```yaml
skills:
  address-threads: [/northwind-code-review, /logion]
  triage: [/logion]
```

The invocation goes first and amy's own instructions follow it, because the
answer has to arrive in the same shape whoever does the work. Only the three
steps an agent performs can be handed over, and a key that is not one of them
is refused rather than ignored.

**Two ladders, and they answer different questions.** The skill ladder is who
should do the step. The harness ladder underneath it is what to do when the
one asked ran out of quota or was not up to it. So a skill is tried across the
harnesses it needs before the next skill gets a turn, and the log says which
axis moved: `harness`, `model` or `skill`.

**A skill named here has to be installed**, meaning a directory holding a
`SKILL.md` under `~/.claude/skills`, which is where the harness looks too. One
that is not installed fails the mount, naming what there was to choose from.
A ladder that quietly means less than it says would first show up as a ticket
escalating for no reason.

## Two ceilings, and neither of them is money alone

An overnight run spends two things that are not yours to spend: quota, and
your colleagues' attention.

**The budget is read from the log, never from a tally of its own.** Two
windows, five hours and a week, each with a ceiling in tokens, in dollars, or
both. The first one to blow parks the work. Tokens are what a subscription
meters and what refuses at three in the morning; dollars are what an API key
costs. A run whose cost nobody reported moves the token ceiling and leaves the
dollar one alone, because adding up a figure nobody measured would invent the
number that decides when to stop.

It is asked **before** the call, not after, and only for a move that would
actually spend an agent. Past the fraction, the engine starts nothing new and
puts the ticket back on the queue with a delay. The ticket is parked, not
lost: the record is untouched and the same move happens when the window has
room.

**And the reviewer ceiling, which is the other currency.** Past
`maxOpenReviewsPerReviewer`, the pull request stays open with nobody assigned
and the ticket waits. The work keeps moving; only the queue of human review
respects the patience of the people in it.

```yaml
policy:
  maxOpenReviewsPerReviewer: 2
agent:
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek: { tokens: 30000000, costUsd: 150 }
    stopAt: 0.9
```

## State of the build

624 tests. The core, the workflow, the plugins, the CLI and the gate all
pass, and `sf verify` proves all 33 of this repository's own rules fire.

<!-- claim: WALKS_A_TICKET_TO_QA proven-by: ticket-to-qa -->
The installed executable walks a ticket from the working status to a QA
handoff, one move at a time, in a test environment where the tracker, the code
host and the coding agent are stand-ins and the repositories, the commits, the
pushes and the gate are real.

Done: the workspace split, the action catalogue, the generic work record and
plan, the typed port contracts, and boot-time validation that an action the
workflow emits has something that runs it.

Not done yet, in the order it matters:

1. **The loader and `amy plugin add|remove|list|verify`.** Plugins are wired by
   the CLI today rather than resolved from a config, so nothing is
   installable from npm yet.
2. **Taking the last of one employer out of it.** The config templates and the
   test fixtures still name real repositories and real people. The logic is
   already neutral; the examples are not.
3. **A `capabilities.yaml` per package**, so Logion can say what each plugin
   reaches before it says whether it works.
4. **`@amy/plugin-sf-gate`**, so the gate is software factory rather than a
   list of shell commands.

And the one that is not code: it has never been pointed at a *real* ticket.
Everything between the ticket and the handoff is now proven end to end against
stand-ins, twice per run, with no credential and no network — see
[the test environment](#the-test-environment). What that cannot prove is
somebody else's schema. The honest next step is one real ticket with
`amy tick`, one move at a time, with a person watching.

---

## One gate, and it is proven

```sh
npm run gate
```

That is the whole definition, in one place: build, tests with a coverage
floor, lint, a dead-code detector, a dependency audit, `sf check` and
`sf verify`. If it is not in there it is not gated.

This repository runs [software factory](https://github.com/nicolasmelo1/software-factory)
on itself: **33 rules, and `sf verify` proves every one of them fires against
a deliberately broken fixture.** So the tool that refuses to open a pull
request until a gate is green is itself held to a gate that is proven to work.

### The hazards nobody notices until the day they matter

Six of those rules are the L6 layer, and none of them audits anything itself:
the ecosystem tools are better than anything a rule could do. What each one
checks is that the tool is **still wired in**, because a scanner somebody
removed to make CI faster fails exactly like one that was never added.

| Hazard | Tool | Where it runs |
| --- | --- | --- |
| Dependency vulnerabilities | `npm audit` | the gate, and CI |
| Committed secrets | `gitleaks` | CI, on what a pull request adds |
| Insecure patterns | `eslint-plugin-security` | the gate, and CI |
| Dead code | `knip` | the gate, and CI |
| Insecure workflows | `zizmor` | CI |
| Performance regression | `vitest bench` | CI, against a committed baseline |

Two of the security plugin's rules are off, in writing:
`detect-non-literal-fs-filename` and `detect-object-injection`. This program
is a file-backed queue, store and log whose every path is computed, and every
object index here is keyed by a union the compiler already checks. Left on
they produced 105 warnings and buried the one real finding, which was a
regular expression that could be made to backtrack forever.

Three L6 rules are disabled, also in writing: there is no dynamic race
detector for this language, and the two lock rules have no TypeScript query
and nothing here takes a lock. The queue is a directory and claiming is an
atomic rename.

The one worth naming is local, in
`.software-factory/rules/core-stays-ignorant.yaml`: **nothing under
`packages/core/src` may import an `@amy/workflow-*` or `@amy/plugin-*`
package.** The whole plugin model rests on that, and until it was a check it
rested on nobody making a single wrong import. Its mutation fixture is a core
file that imports a workflow's type, and `sf verify` confirms the rule still
catches it.

### The tests exercise classes. The gates exercise the artifact.

624 tests all import a source file and call a method. That is worth having and
it is not the same claim as "the published package works": a barrel that
forgets an export, or a `dist` nobody built, passes the whole suite and is
broken on the machine that installs it.

So each plugin gets an `sf` **gate**: a scenario that imports `dist/index.js`
from another process, asserts what the plugin promises, and writes a report
that is sealed with a digest.

```sh
npm run e2e          # run the scenario
sf seal <gate>       # record it
```

The point is the shelf life. The gate declares the plugin's source as its
activation paths, so **changing the plugin expires the proof**:

```
$ printf '\n// one line\n' >> plugins/file-queue/src/FileQueue.ts
$ sf check --allow-commands
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `plugin-file-queue` was proven
```

Five gates exist. `@amy/plugin-file-queue`, because the engine cannot survive
it handing one item out twice. `@amy/plugin-agent-relay`, because it decides
how money gets spent when something goes wrong. `@amy/plugin-serial-engine`,
because it decides whether a ticket gets lost. The installed binary, because
every test in the suite imports from inside the workspace. And the whole
machine, below, because none of the four answers the question somebody
actually has.

### The test environment

Five scenarios run under `npm run e2e`, and the last one is the whole machine.
It installs the executable, drops it in a directory with no checkout in it,
and drives it through one ticket with the commands the sections above tell an
operator to type: `amy init`, `amy roster confirm`, `amy doctor`,
`amy discover`, then `amy tick` until there is nothing due.

What it is driven against is a world:

| Real | A stand-in |
| --- | --- |
| the installed binary, and every adapter in it | the tracker, as GraphQL on a loopback socket |
| two git repositories, the clones, the commits, the push | `gh`, as an executable on the `PATH` |
| the gate, as two shell commands against a real file | `claude`, as an executable that edits real files |

The stand-ins are processes on the other side of a boundary amy already had,
so what runs is the real argv, the real HTTP client, the real envelope
parsing and the real ordering. What is faked is the part that would otherwise
need somebody's credentials, somebody's quota and somebody's afternoon.

The world is built from scratch on every run and the whole lifecycle runs
**twice, in two separate worlds, and the two trails are compared** — because
"it worked once" and "it works" are different claims. It takes about ten
seconds, needs no credential, and reaches nothing outside the machine, which
is why CI runs it on every pull request.

```sh
npm run e2e                                                  # all five
./.software-factory/evidence/ticket-to-qa-scenario.sh        # just the machine
./.software-factory/evidence/ticket-to-qa-scenario.sh --keep # and leave the world on disk
```

`--keep` prints the directory it kept, and there is a
[README beside the scenario](.software-factory/evidence/ticket-to-qa/README.md)
on how to walk around inside one afterwards.

The one thing the run cannot make deterministic is the day of the week: the
machine refuses to assign a reviewer against a roster nobody confirmed today,
and it does not ask at the weekend, because nobody is there to answer. So that
rule is asserted against the day the run happens on, and it is reported rather
than required. Everything the gate requires holds on a Tuesday and on a
Sunday.

Coverage thresholds sit just under what the suite achieves, so coverage can
only be ratcheted up. Two complexity findings are frozen in
`.software-factory/ratchet.yaml` with a note saying why, and
`L2.NO_PERMANENT_EXCEPTION` makes sure each carries a review date.

## Layout

```text
packages/
├── core/                    contracts, the action catalogue, the registry
├── workflow-ticket-to-qa/   the states, the port contracts, a pure plan()
├── model-specs/             what a model costs, vendored and locked
├── agent-kit/               what every harness plugin shares
├── cli/                     the amy command
└── test-fixtures/           shared builders and scripted doubles

plugins/
├── file-queue/              queue
├── file-store/              store
├── file-log/                the event log
├── serial-engine/           engine
├── linear/                  tracker
├── github/                  code host
├── claude/                  agent
├── codex/                   agent
├── hermes-agent/            agent
├── agent-relay/             the agent port, and the ladder behind it
├── command-gate/            gate
├── notify-fanout/           notifier, and the channels it fans out to
├── notify-hermes/           channel: Hermes
└── notify-inbox/            channel: a file plus a desktop notification
```

A plugin's directory drops the prefix its package name keeps: `plugins/github`
publishes as `@amy/plugin-github`. The folder says where it lives, the package
name says what it is, and only the second one is a promise to anybody outside
this repository.

`core` depends on no other package here. The workflow depends only on `core`.
An adapter depends on `core` for infrastructure and on the workflow for the
types it has to satisfy. Nothing depends on the CLI.

## License

MIT
