# The test environment

A world amy can be put to work in, with nobody real in it.

```sh
./.software-factory/evidence/ticket-to-qa-scenario.sh          # run it
./.software-factory/evidence/ticket-to-qa-scenario.sh --keep   # keep the world
```

It builds and installs the executable, builds the world in a scratch
directory, and drives one ticket from the working status to a QA handoff with
the commands an operator types. It takes about ten seconds, needs no
credential, and talks to nothing outside the machine.

## What is real and what is not

| Real | A stand-in |
| --- | --- |
| the installed executable, and every adapter inside it | `tracker.mjs` — Linear's GraphQL API, on a loopback socket |
| two git repositories, their clones, the commits, the push | `bin/gh` — the code host, as the CLI amy shells out to |
| the gate, as two shell commands in the checkout | `bin/claude` — the coding agent, editing real files |
| the queue, the store, the log, the roster, the notifications | |

Each stand-in sits on the other side of a boundary amy already had, so the
real argv, the real HTTP client, the real envelope parsing and the real
ordering are all still under test. The head sha `bin/gh` reports is read out
of the real repository, which is what makes a review go stale when a fix is
pushed.

## The files

| | |
| --- | --- |
| `world.mjs` | the world: tickets, repositories, other people's open reviews, the roster, the config, the agent's script |
| `tracker.mjs` | the stand-in tracker, one process, state in a JSON file |
| `bin/gh`, `bin/claude` | the two stand-in executables, copied onto the `PATH` of the run |
| `drive.mjs` | the run: the commands, what the world does between looks, the assertions, the report |

## Walking around inside a kept world

`--keep` prints the directory. There are two of them, one per pass.

```text
<kept>/home         where amy was run from: .amy/config.yaml, tickets/, queue/, log/, needs-input/
<kept>/checkouts    the clones the agent worked in
<kept>/origins      the bare repositories it pushed to
<kept>/world        tracker.json, code-host.json, agent.json, and a log per stand-in
<kept>/bin          the amy under test is *not* here; these are the stand-ins
```

The interesting reads:

```sh
cat <kept>/home/.amy/tickets/BILL-4021.json          # everything the machine remembers
cat <kept>/home/.amy/log/*.jsonl | jq -r '.kind'     # every move it made, in order
cat <kept>/world/claude.log | jq -r '.step'          # what the agent was asked, and when
cat <kept>/world/gh.log | jq -r '.argv | join(" ")'  # every call to the code host
jq '.issues[0].comments' <kept>/world/tracker.json   # what landed on the ticket
git --git-dir <kept>/origins/widgets.git log --oneline amy/bill-4021-show-the-currency-on-the-invoice-total
```

And it can be driven further by hand, because the world is still there:

```sh
cd <kept>/home
PATH="<kept>/bin:$PATH" HOME="$PWD" AMY_E2E_WORLD=<kept>/world \
  AMY_E2E_ORIGINS=<kept>/origins <path-to>/amy status
```

The tracker's endpoint is in `.amy/config.yaml`, and the process behind it is
gone once the run ends, so anything that reaches the tracker needs it started
again:

```sh
node tracker.mjs <kept>/world/tracker.json <kept>/world/tracker.port
```

## Changing what the world does

Everything the run depends on is data in `world.mjs`: the tickets and their
statuses, which repository each team's work lands in, how many open reviews
each reviewer is already carrying, the gate's commands, and the agent's script
— what it answers at triage, which comment it refuses, and what it does once
the owner has settled it.

The one rule to keep is the timing rule in `drive.mjs`: the world only moves
**after a look that made no move**. That is what puts a genuine wait in front
of every waiting state, instead of letting the answer be there before the
question was asked.

Adding an assertion means adding it in `drive.mjs`, and adding a *required*
one means naming it in `gates.ticket-to-qa.required_assertions` in
`.software-factory/policy.yaml` and citing it from a criterion in
`plans/the-lifecycle-is-proven-end-to-end.md`. Then re-run and
`sf seal ticket-to-qa`.
