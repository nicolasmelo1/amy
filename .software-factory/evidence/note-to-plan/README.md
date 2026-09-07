# The test environment

A world a piece of friction can become a plan in, with no tracker in it.

```sh
./.software-factory/evidence/note-to-plan-scenario.sh          # run it
./.software-factory/evidence/note-to-plan-scenario.sh --keep   # keep the world
```

It builds and installs the executable, builds the world in a scratch
directory, and drives four notes with the commands an operator types. It takes
a few seconds, needs no credential, and talks to nothing outside the machine.

## What is real and what is not

| Real | A stand-in |
| --- | --- |
| the installed executable, and every adapter inside it | `bin/gh` — the code host, as the CLI amy shells out to |
| two git repositories that keep their plans in `plans/`, their clones, the commits, the push | `bin/claude` — the agent, writing real plan files |
| the queue, the store, the log, the notifications, the budget | `bin/sf` — the repository's own check |

The stand-in `sf` is the one worth explaining. It is **not** scripted: it reads
the plans on disk and applies the two rules a plan in a repository like this
has to satisfy — it declares an exit condition, and it sits in the ordered
list. So the red answer the agent is sent back with comes from the plan
genuinely being incomplete, rather than from a fake deciding to say no. That
is the difference between proving the quality bar and proving a mock.

## The four notes

| | |
| --- | --- |
| by `amy note` | the ordinary path: written down and queued in one step, and it reaches a pull request |
| dropped into `.amy/notes/` | a file an editor, a hook or a shell one-liner would leave, found by `amy discover`, and it meets the ceiling on the way |
| about a repository this install does not write into | declined, and handed to the operator instead |
| about a repository whose code host is not answering | the tick gives up, and *that* leaves a note behind |

The last one is the loop closing. Nothing in the engine knows what a note is:
it says it has stopped, a channel turns that into a note, and the second
workflow would pick that up like any other.

## The files

| | |
| --- | --- |
| `world.mjs` | the world: two repositories with plans in them, the code host, the config |
| `bin/gh`, `bin/claude`, `bin/sf` | the three stand-in executables, copied onto the `PATH` of the run |
| `drive.mjs` | the run: the commands, the assertions, the report |

## Walking around inside a kept world

```text
<kept>/home         where amy was run from: .amy/config.yaml, notes/, plans/, plan-queue/, log/
<kept>/checkouts    the clones the agent wrote plans in
<kept>/origins      the bare repositories it pushed to
<kept>/world        code-host.json, agent.json, and a log per stand-in
```

The interesting reads:

```sh
cat <kept>/home/.amy/notes/*.md                          # every piece of friction, including the one a failure wrote
cat <kept>/home/.amy/plans/*.json                        # everything the machine remembers about each
cat <kept>/world/claude.log | jq -r '.told'              # whether the agent was handed a finding
cat <kept>/world/sf.log | jq -r '.cwd'                   # where the check ran
jq '.repos' <kept>/world/code-host.json                  # the pull requests it opened
git --git-dir <kept>/origins/amy.git log --oneline --all
```

## Changing what the world does

Everything the run depends on is data in `world.mjs`: the repositories, which
of them the code host refuses, and the config — including the ceiling, which
is one here so that a second note arriving while the first is still in flight
meets it rather than sailing past.

Adding an assertion means adding it in `drive.mjs`, and adding a *required*
one means naming it in `gates.note-to-plan.required_assertions` in
`.software-factory/policy.yaml` and citing it from a criterion in
`docs/design/friction-becomes-a-plan.md`. Then re-run and `sf seal note-to-plan`.
