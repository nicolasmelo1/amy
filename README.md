# amy

**A**utomate **MY** work.

**Leave it running, and it does the long part of your work while you are somewhere else — built the way *you* work, not the way somebody else does.**

---

## What it is, in a minute

You pick up a ticket. Writing the code is not the hard part any more — an
agent is already good at that. The long part is everything *around* it:

> read the ticket → ask when something is unclear → do the work → run the
> checks → open the pull request → answer the review bot → pick a reviewer →
> deal with their comments → hand it to QA

That takes days, and most of it is waiting on other people. amy is a small
machine that sits there and walks it one step at a time, so you stop having to
hold it in your head.

```sh
amy start                            # off it goes, in the background
amy status                           # where everything stands
amy btw "bump the deps in the api"   # something you thought of in passing
```

## The part that makes it different

**That process above is not baked in.** It is one *workflow*, and a workflow
is just a small package you can read in one sitting. It says two things: what
happens next, and how each step is done.

Your team does not work like mine. A tool that ships somebody else's process
is a tool that is *nearly* right for you, and nearly-right is where automation
goes to be abandoned. So amy ships the machine, and **you assemble the process
before you use it.**

Three come in the box, and you can write a fourth in an afternoon:

| | |
| :-- | :-- |
| **ticket-to-qa** | a tracker ticket, all the way to a QA handoff |
| **note-to-plan** | friction amy hit becomes a written plan in the right repo |
| **errand** | something you said in passing becomes a pull request |

The bits underneath are swappable too, not just the process. The thing that
talks to your tracker, the thing that opens pull requests, the agent it asks,
where it writes things down, how it reaches you — every one of those is a
plugin, and changing one is a line of config. Nothing here is welded shut.

## It lives *under* your tools, not inside one

amy is installed once on your machine and keeps running on its own. Claude
Code, Codex, Hermes, a terminal, your phone at 2am — those are all just doors
into the same machine.

```text
   Claude Code      Codex       Hermes       your terminal
        └──────────────┴───────────┴──────────────┘
                            amy
              one install, one memory, always up
```

Close the laptop lid and it keeps its place. Ask from a different app tomorrow
and you get the same answer, because the state belongs to amy and not to the
conversation you happened to be having.

And it is open source, because a machine that runs *your* process is a machine
you have to be able to read.

**New here?** [Quickstart](#quickstart-5-minutes) is five minutes.
Want it to work your way? [Write your own workflow](#write-your-own-workflow).
Want to change amy itself? [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Quickstart (5 minutes)

### 1. Install — 1 min

```sh
npm run install:local     # packs every package, installs to ~/.local/bin/amy
amy --version             # 0.1.0 (83ef192, built 2026-09-03T20:28:44Z)
```

One install per machine, not one per repository: amy drives work in
checkouts all over the disk and is reached from whichever agent harness you
happen to be in, so everything it knows lives in `~/.amy`. `AMY_HOME`
overrides that; nothing else does.

That command installs every plugin. A machine with no `codex` on it has no
reason to carry the plugin that shells out to one, so `AMY_PACKAGES` takes a
subset, and `amy init` prints the `npm install` line for whatever a configured
workflow needs and this machine does not have.

### 2. Set it up — 2 min

```sh
amy init                  # writes ~/.amy/config.yaml and ~/.amy/roster.yaml
# edit both
amy roster confirm        # stamp today's date
amy doctor                # every dependency, checked before it touches a ticket
```

The Linear personal API key comes from Settings, Security and access, and goes
in `~/.amy/.env`. Anything already exported in the shell wins over the file.

`amy doctor` checks the config, each plugin's settings against the schema that
plugin declared, the roster's freshness, the API key, `gh`, `claude` and
`git`, the notification target, and that every configured repository is
actually checked out. It exits non-zero, so it is safe to gate on.

If you would rather be walked through it, `/amy-init` does the same interview
and reads the result back in numbers.

### 3. Watch it make one move — 1 min

```sh
amy discover              # put in-progress tickets on the queue
amy tick                  # exactly one move, then exit
amy status                # where everything stands, and what waits on you
```

`tick` is the whole product in one command. Run it until you trust it.

### 4. Leave it running — 1 min

```sh
amy start --every 60      # the loop, in the background, looking every minute
amy status                # says whether the loop is up, and since when
amy stop                  # ends it
```

`pause` and `stop` are different things. `amy pause "deploying"` is the
handbrake: it ends work in flight, starts nothing new, and the loop stays up
until `amy resume`. `amy stop` ends the loop itself. Pausing survives a
reboot, because it is a file; the loop does not, because it is a process.

### 5. Put the skills in your harnesses — 30 sec

```sh
amy skills                # finds the harnesses on this machine and asks
```

amy is driven from Claude Code, from Hermes, from a terminal — so its skills
install into each harness it finds rather than into one project. They ship
inside `@amy/cli`, so they cannot drift out of step with the amy that ships
them.

## Write your own workflow

The two workflows above are packages, and nothing in amy's own code names
them. A third is yours:

```yaml
# ~/.amy/config.yaml
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
```

```sh
npm install -g @acme/workflow-oncall
amy --workflow oncall start
```

That package exports a `plan()` — pure, `(record, observation, policy) => Plan`
— and a runtime that says how each of its actions runs. About forty lines for
a simple one; there is a complete example at
[`.software-factory/evidence/installed-plugins/workflow-oncall/index.js`](.software-factory/evidence/installed-plugins/workflow-oncall/index.js).

The point is the ones that cannot be shared. A process that names your
employer's tooling, a private feedback step, an on-call rota: those live in a
package of yours, versioned wherever you like, and amy mounts them exactly the
way it mounts its own. `/amy-workflow` designs one by interrogating you a
question at a time.

Each profile keeps its records and queue under `~/.amy/<name>/`, so swapping
which workflow you drive never costs you the other one's state.

## Commands

| Command | What it does |
| :-- | :-- |
| `amy init` | Write the config and roster templates. |
| `amy doctor` | Check everything it depends on. Exits non-zero when something is wrong. |
| `amy discover` | Put every piece of work the workflow can find onto the queue. |
| `amy tick` | Advance one piece of work by one move. |
| `amy run` | Keep advancing until nothing is due, then exit. `--max N`. |
| `amy start` | Run the loop in the background. `--every <seconds>`. |
| `amy stop` | End that loop. |
| `amy pause` / `amy resume` | The handbrake. Ends work in flight, starts nothing new. |
| `amy status` | Where everything stands, the queue, the loop. `--json`. |
| `amy note "<text>"` | Write a piece of friction down and queue it. |
| `amy btw "<text>"` | Something to do, said in passing. Queued as an errand, never a ticket. |
| `amy workflow list` | Every workflow this install can drive, and what each holds. |
| `amy workflow rm <name>` | Forget one: records, queue, config entry. Needs `--yes`. |
| `amy plugin list` | What is installed, and what this profile mounts. |
| `amy plugin add` / `remove` | Change what a profile mounts. |
| `amy skills` | Install the skills into the harnesses on this machine. |
| `amy budget` | What the agents have spent, against the ceiling. |
| `amy roster confirm` / `show` | Who is reviewing today. |
| `amy queue prune` / `recover` | Tidy the queue; return what a dead worker left. |
| `amy models show` / `refresh` | What each model is believed to cost. |

`--workflow <name>` before any of them chooses which profile it drives.

## The skills

Six skills, shipped inside `@amy/cli` and installed into every harness on the
machine by `amy skills`. Invoke them by name.

| Skill | When |
| :-- | :-- |
| `/amy` | Driving it: pick up a ticket, move work on, read the status. |
| `/amy-init` | Setting it up, or when `amy doctor` is red and it is not obvious why. |
| `/amy-btw` | Capturing something said in passing as work amy will do. |
| `/amy-workflow` | Designing a workflow, or changing one. One question at a time. |
| `/amy-show-me` | Seeing a workflow: its shape, and why one thing is stuck. |
| `/amy-status` | What should I do today, from the project's side rather than the machine's. |

Changing amy's own codebase is not one of them, and deliberately: it is what
[`CONTRIBUTING.md`](CONTRIBUTING.md) is for. A skill in front of somebody who
installed amy to drive their tickets, describing a repository they do not
have, is noise in the one place noise is expensive — the list an agent reads
when deciding what to reach for.

Their job is judgement — interrogating a design, reading a config, choosing
what to show. Everything a command can do, a command does: a skill that
wrapped one would be a second thing to keep in step, and one that quietly did
not load looks exactly like one that did and had nothing to say.

## Why an install, not a checkout

**The code under test should be the code that ships.** Every unit test here
imports a source file from inside the workspace, so an install missing half of
what it needs passes all of them. That is why plugins resolve by name at run
time, why naming one nobody installed is refused at boot with the list of what
is installed, and why there is a gate that runs the installed command from a
directory with no checkout in it.

**Your working directory should not be a repository.** amy works on tickets
that name real colleagues and real customers. If the program doing that work
ran inside a git repository, every accident that drops a file in the working
directory would be one `git add -A` away from being published. It keeps
nothing where you are standing.

Every line amy writes to the log names the build that wrote it. An install
built from a tree with uncommitted work in it stamps `dev`, because that is
the truth: it is not a release anybody can go back to.

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

### And a second one, over work that is not a ticket

```text
NOTED ──► DRAFTED ──► CHECKED ──► PR_OPEN ──► DONE
   │         ▲            │
   │         └────────────┘
   │          the check is red
   └──► DECLINED
```

Friction this machine hits — an adapter that lied, a step that needed three
tries, a limitation somebody worked around — is written down as a **note**,
and a note becomes a pull request adding a plan to the repository it is about.
Nothing resolves it against a tracker, because there is nothing to resolve: it
exists because somebody, or something, wrote it down.

```sh
amy note "the relay retries a harness that already said it was out of quota"
amy --workflow note-to-plan tick
```

`DRAFTED` is an agent writing `plans/<slug>.md` and its line in
`next-steps.md`. `CHECKED` is `sf check` in that repository, which is the whole
quality bar: a plan with no exit condition, or one missing from the ordered
list, is red and goes back to the agent with the finding. Nobody invented a
rubric — the repository being written into already has one, and it is the same
one a human contributor meets.

The two workflows run on the same engine, the same queue and store, the same
relay and forge, and one event log — so one budget. Only the records and the
queue are per workflow, under `.amy/<name>/`, so swapping which one you drive
never costs you the other one's state. `--workflow` chooses which, because
`mount()` still claims a single workflow.

And there can be a third, which is the point of the two being plugins.
A profile is an entry in the config:

```yaml
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"    # a package this repository never shipped
```

Install that package and `amy --workflow oncall tick` drives it, on the same
engine, against the same budget. Nothing in the command line enumerates what
is allowed.

And it closes: a tick this machine gives up on leaves a note behind, so the
thing that broke becomes the thing that gets fixed.

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
  actions:  triage, implement, run-gate, draft-plan, open-pull-request,
            address-threads, assign-reviewer, request-rereview, escalate,
            hand-off-to-qa, announce    each declares the port it needs
  ports:    Queue, Store, Notifier, EventLog, Budget, StopSwitch,
            CodeHost, Harness           none of them names a domain
  contract: Workflow + WorkflowRuntime  what an engine drives, generically
      ▲                                          ▲
      │ composes actions                         │ implements ports
      │                                          │
@amy/workflow-ticket-to-qa              @amy/plugin-linear       tracker
  the sixteen states, a pure plan(),    @amy/plugin-github       code-host
  its typed port contracts, and the     @amy/plugin-claude       harness
  runtime that runs its actions         @amy/plugin-agent-relay  agent
      │                                 @amy/plugin-command-gate gate
@amy/workflow-note-to-plan              @amy/plugin-plan-check   plan-check
  five states and one refusal, over     @amy/plugin-file-notes   notes
  work that never was a ticket          @amy/plugin-notify-*     notifier
      │                                 @amy/plugin-file-queue   queue
      │ each contributes a runtime      @amy/plugin-file-store   store
      ▼
@amy/plugin-serial-engine
  a queue, a budget, a retry count and a stop switch — and no idea what a
  ticket or a plan is
```

**The engine drives a workflow it does not know.** It asks the workflow what
to do next, asks the *runtime* the workflow contributed to do it, and holds
the queue, the attempt counts, the budget and the handbrake in between. Every
noun in `Worker.ts` is one of those; a ticket, a pull request and a reviewer
appear nowhere in it. So a second workflow over a different domain costs a `plan()` and a runtime,
not a fork of the engine — and `@amy/workflow-note-to-plan` is that second
workflow, running on this engine unmodified. Building it found one defect in
the seam: every runtime was folding the plan into the record twice, which
counted every retry as two. That is what a real second user is for.

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

The core is generic on purpose, so type safety comes from the other side: a
workflow package declares and exports `Ticket`, `Roster`, `Note` and its own
record, and narrows the ports it uses to what it needs of them. Two workflows
share one mounted `agent` port and type it differently — one as an `Agent`
with `triage` and `implement`, the other as a `Harness` with nothing in it but
`ask` — and neither has to know the other exists. The cast between a typed
record and the core's generic one lives at one boundary per workflow, in its
`Workflow` object, rather than being spread around.

What is genuinely domain-free lives in the core: `CodeHost` and the pull
request it returns name a repository, a branch and a login, and `Harness` is a
prompt, a directory and an account of what the answer cost.

Nothing reaches the outside world except through `CommandRunner` or
`GraphQLClient`, which is why every adapter is tested against a scripted
answer instead of the real `gh`, `claude`, `git` or API.

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

774 tests. The core, both workflows, the plugins, the CLI and the gate all
pass, and `sf verify` proves all 33 of this repository's own rules fire.

<!-- claim: WALKS_A_TICKET_TO_QA proven-by: ticket-to-qa -->
The installed executable walks a ticket from the working status to a QA
handoff, one move at a time, in a test environment where the tracker, the code
host and the coding agent are stand-ins and the repositories, the commits, the
pushes and the gate are real.

<!-- claim: TURNS_FRICTION_INTO_A_PLAN proven-by: note-to-plan -->
The same executable turns a line somebody typed — or a tick it gave up on —
into a pull request adding a plan to the repository the friction is about,
with no tracker anywhere in it, and stops opening them once the ceiling is
reached.

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
4. **`@amy/plugin-sf-gate`**, so the ticket gate is software factory rather
   than a list of shell commands. The plan workflow's check already is.

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

Seven gates exist. `@amy/plugin-file-queue`, because the engine cannot survive
it handing one item out twice. `@amy/plugin-agent-relay`, because it decides
how money gets spent when something goes wrong. `@amy/plugin-serial-engine`,
because it decides whether a ticket gets lost. The installed command, because
every test in the suite imports from inside the workspace. A machine that
installed four packages and a workflow written elsewhere, because a plugin
model nobody outside this repository can use is not one. And the two whole
workflows, below, because none of the others answers the question somebody
actually has.

### The test environment

Seven scenarios run under `npm run e2e`, and the last two are the whole machine.
The one below installs amy, drops it in a directory with no checkout in it,
and drives it through one ticket with the commands the sections above tell an
operator to type: `amy init`, `amy roster confirm`, `amy doctor`,
`amy discover`, then `amy tick` until there is nothing due.

What it is driven against is a world:

| Real | A stand-in |
| --- | --- |
| the installed command, and every adapter in it | the tracker, as GraphQL on a loopback socket |
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
├── workflow-ticket-to-qa/   sixteen states, from in progress to QA
├── workflow-note-to-plan/   five states and a refusal, from friction to a plan
├── workflow-errand/         five states, from a sentence to a pull request
├── model-specs/             what a model costs, vendored and locked
├── agent-kit/               what every harness plugin shares, and the ladder
├── cli/                     the amy command
└── test-fixtures/           shared builders and scripted doubles

plugins/
├── file-queue/              queue
├── file-store/              store
├── file-log/                the event log
├── file-notes/              notes, and the channel that writes one on a failure
├── file-tasks/              tasks, written by `amy btw` or by hand
├── serial-engine/           engine
├── linear/                  tracker
├── github/                  code host
├── claude/                  harness
├── codex/                   harness
├── hermes-agent/            harness
├── agent-relay/             the agent port, and the ladder behind it
├── command-gate/            gate
├── plan-check/              plan-check
├── command/                 any CLI, by a name the config allows
├── notify-fanout/           notifier, and the channels it fans out to
├── notify-hermes/           channel: Hermes
└── notify-inbox/            channel: a file plus a desktop notification

packages/cli/skills/         shipped inside @amy/cli, installed by `amy skills`
├── amy/                     driving it
├── amy-init/                setting it up
├── amy-btw/                 capturing something said in passing
├── amy-workflow/            designing one, a question at a time
├── amy-show-me/             seeing one
└── amy-status/              what should I do today
```

A plugin's directory drops the prefix its package name keeps: `plugins/github`
publishes as `@amy/plugin-github`. The folder says where it lives, the package
name says what it is, and only the second one is a promise to anybody outside
this repository.

`core` depends on no other package here. A workflow depends only on `core`.
An adapter depends on `core` for infrastructure, and on a workflow only for
the types that workflow declares — which is why `plugins/github` depends on
neither: `CodeHost` is the core's, and one mounted adapter serves both
workflows. Nothing depends on the CLI.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) — the five minutes before your first
change, what has to be green, and the one architectural rule everything else
follows from.

## License

MIT
