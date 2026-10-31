# The test environment

A world five errands are run in, with no tracker in it.

```sh
./.software-factory/evidence/errand-scenario.sh          # run it
./.software-factory/evidence/errand-scenario.sh --keep   # keep the world
```

It builds and installs the executable, builds the world in a scratch
directory, and drives five errands with the commands an operator types. It
takes a few seconds, needs no credential, and talks to nothing outside the
machine.

## What is real and what is not

| Real | A stand-in |
| --- | --- |
| the installed executable, and every adapter inside it | `bin/gh` — the code host, as the CLI amy shells out to |
| the repository, the worktrees cut from it, the commits, the pushes, the branch the pull request is opened on | `bin/claude` — the agent, editing a real file, answering a question, or refusing |
| the queue, the records, the log, the notifications, the profile boundary | |

The stand-in agent is the one worth explaining. It is **not** scripted to a
decision: it reads the prompt it was handed, which is the sentence somebody
said in passing, and does one of three things with it. The edit it makes for
the first errand is a real edit in the checkout amy prepared, so the commit,
the push and the pull request that follow are real.

## The five errands

| | |
| --- | --- |
| typed at `amy btw` | written down and queued in one step, and it reaches a pull request |
| dropped into `~/.amy/tasks/` | a file an editor, a hook or a shell one-liner would leave, found by `amy discover` |
| a sentence the agent refuses | declined after one attempt, with the refusal on the announcement |
| about a repository this install does not work in | declined without spending an agent on it at all |

The second and the third are the interesting halves. The first proves that a
clean tree is a finished errand rather than a failure — it is the errand that
opened an empty pull request before `commitsAhead` existed — and the last one
proves the boundary is the config's, not a guess.

## The files

| | |
| --- | --- |
| `world.ts` | the repository, the code host, the task sentences and the config |
| `bin/gh`, `bin/claude` | the two stand-in executables, each a `sh` wrapper that runs the `.ts` beside it through tsx, copied onto the `PATH` of the run |
| `drive.ts` | the run: the commands, the assertions, the report |

## Walking around inside a kept world

```text
<kept>/home         where amy was run from: .amy/config.yaml, .amy/tasks/, .amy/errand/, .amy/needs-input/, .amy/log/
<kept>/checkouts    the standing checkout the worktrees are cut from
<kept>/trees        the per-errand worktrees the agent was handed
<kept>/origins      the bare repository the branches were pushed to
<kept>/world        code-host.json, agent.json, and a log per stand-in
```

The interesting reads:

```sh
cat <kept>/home/.amy/tasks/*.md                      # every errand, in the words of whoever said it
cat <kept>/home/.amy/errand/records/*.json           # everything the machine remembers about each
cat <kept>/world/claude.log | jq -r '.cwd'           # where the agent actually ran
jq '.repos' <kept>/world/code-host.json              # the pull requests it opened
git --git-dir <kept>/origins/amy.git for-each-ref    # the branches that exist
```

## Changing what the world does

Everything the run depends on is data in `world.ts`: the repository, the five
sentences, and the config — including the one attempt, which is what makes a
refusal terminal rather than something the work climbs until it gives up.

Adding an assertion means adding it in `drive.ts`, and adding a *required*
one means naming it in `gates.errand.required_assertions` in
`.software-factory/policy.yaml` and citing it from a criterion in
`docs/design/the-errand-is-proven-end-to-end.md`. Then re-run and `sf seal
errand`.
