# ticket-to-qa

**Move a ticket from "in progress" to "ready for QA" while you do something
else.**

Writing the code is rarely the long part of a ticket. Reading it, asking what
it means, running the checks, opening the pull request, waiting for review,
answering the comments and handing it to QA are the parts that wait on people.

This workflow does that walk for you. You move a ticket to your tracker's
working status, and amy picks it up: it reads the ticket, asks you when
something is unclear, has an agent write the code, runs your checks, opens the
pull request, asks a reviewer, fixes what the review asks for, and moves the
ticket to QA once it is approved. When it gets stuck, it tells you and waits,
instead of guessing.

## How it moves

```text
DISCOVERED ──> CLARIFYING ──> READY ──> IMPLEMENTING ──> GATE + SELF_REVIEW ──> PR_OPEN
                                             ^                    │
                                             └─ found something ──┘

PR_OPEN ──> COPILOT_WAIT <──> COPILOT_FIX
                 │
                 v
         REVIEWER_ASSIGNED ──> HUMAN_REVIEW <──> HUMAN_FIX, RE_REVIEW
                                    │
                                    v
                                APPROVED ──> QA_HANDOFF ──> DONE
```

1. **DISCOVERED, CLARIFYING, READY.** An agent reads the ticket. If it leaves
   questions open, amy asks you in the ticket's thread and waits for the answer.
2. **IMPLEMENTING.** An agent writes the change on its own branch.
3. **GATE and SELF_REVIEW.** Two things run side by side: your checks (tests,
   lint, whatever you configured) and a review of the change by an agent. If either
   finds something, the work goes back to IMPLEMENTING.
4. **PR_OPEN, COPILOT_WAIT, COPILOT_FIX.** amy opens the pull request and deals
   with automated review comments first, so a person never reviews something a
   bot already flagged.
5. **REVIEWER_ASSIGNED, HUMAN_REVIEW, HUMAN_FIX, RE_REVIEW.** amy picks a
   reviewer from today's roster, waits for the review, fixes what was asked and
   asks for another look.
6. **APPROVED, QA_HANDOFF, DONE.** The ticket moves to your QA status.

At any point it can go to **ESCALATED**: the agent failed every attempt, the
checks stayed red, the pull request got too big, or a comment needs the owner
of the ticket. amy tells you, waits, and goes back to where it stopped once you
answer.

## What it needs

This is the largest example, so it needs the most pieces:

- **A tracker** for the tickets, like `@amykit/plugin-linear`.
- **A code host** for branches and pull requests, like `@amykit/plugin-github`.
- **An agent** to read, write and review code, like `@amykit/plugin-claude`.
- **A gate** that runs your checks, like `@amykit/plugin-command-gate`.
- **A notifier** to ask you things and tell you how it went, like
  `@amykit/plugin-slack`.

`amy add` installs these for you, and `amy doctor` tells you what is still
missing.

It also keeps a **roster**: a `roster.yaml` file with the people who can
review today. `amy roster confirm` stamps it each morning, and `amy doctor`
complains when it is out of date, so nobody gets a review request on their day
off.

## Try it

```sh
amy add @amykit/workflow-ticket-to-qa
amy roster show
amy roster confirm
amy doctor
amy tick        # one move at a time, so you can watch it
amy status
```

Two settings are required: `qaStatusName`, the tracker status a ticket moves
to when it is handed to QA, and `repos`, the repositories amy counts review
load across. If you would rather amy did not write to the tracker or the code
host at all, set `policy.writes: operator` and it will tell you each move to
make instead.

<!-- amy:generated reference -->

## Install

```sh
# Add @amykit/workflow-ticket-to-qa to amy.yaml, then install configured plugins:
amy init --install
```

Then name it in `~/.amy/config.yaml`:

```yaml
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"
```

## The lifecycle

| State | Kind |
| :-- | :-- |
| `DISCOVERED` | initial |
| `CLARIFYING` | waiting |
| `READY` | working |
| `IMPLEMENTING` | working |
| `checks` | working |
| `GATE` | working |
| `SELF_REVIEW` | working |
| `verdict` | working |
| `PR_OPEN` | working |
| `COPILOT_WAIT` | waiting |
| `COPILOT_FIX` | working |
| `REVIEWER_ASSIGNED` | working |
| `HUMAN_REVIEW` | waiting |
| `HUMAN_FIX` | working |
| `ESCALATED` | waiting |
| `RE_REVIEW` | working |
| `APPROVED` | working |
| `QA_HANDOFF` | working |
| `DONE` | terminal |

It emits `address-threads`, `announce`, `ask-question`, `assign-reviewer`, `discuss`, `escalate`, `hand-off-to-qa`, `implement`, `open-pull-request`, `request-rereview`, `resolve-review-thread`, `run-gate`, `self-review` and `triage`.

## Configuration

```yaml
plugins:
  "@amykit/workflow-ticket-to-qa":
    baseBranch: {}
    budget: {}
    defaultBranch: "main"
    policy:
      conversation: "answer"
      maxGateAttempts: 3
      maxImplementAttempts: 3
      maxOpenReviewsPerReviewer: 2
      maxPullRequestFiles: 60
      maxPullRequestLines: 2000
      pollBackoffMs: 300000
      rosterBackoffMs: 1800000
      writes: "machine"
    qaStatusName: <string>
    repos: <string[]>
    reviewerHints: {}
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `baseBranch` | `record` | no | `{}` | where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch |
| `budget` | `record` | no | `{}` | agent budget, including an optional progress block that stops repeated no-evidence runs |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, for a repository that named none, which is not always `main` |
| `policy.conversation` | `string` | no | `answer` | answer: a reply in the work's thread is your decision, and the work moves on it. discuss: a reply is a turn in a discussion, answered in the thread while the work waits; mark the reply that decides and only that one moves it. A reply you marked reads as marked under either, and without a thread a comment on the ticket is always the decision |
| `policy.maxGateAttempts` | `number` | no | `3` | how many times the gate may see one change before the work is escalated |
| `policy.maxImplementAttempts` | `number` | no | `3` | how many times an agent may try to implement one ticket before it is escalated |
| `policy.maxOpenReviewsPerReviewer` | `number` | no | `2` | how many open reviews one person may be carrying before this machine stops adding to their pile. Review time is somebody else's, and it is the one currency here that cannot be topped up |
| `policy.maxPullRequestFiles` | `number` | no | `60` | how large a pull request may get, in files, before this machine stops handing it to an agent. The forge has already told us the size, so a pull request nobody should automate is handed back before an agent is called. Zero switches it off |
| `policy.maxPullRequestLines` | `number` | no | `2000` | how large a pull request may get, in changed lines, under the same rule as maxPullRequestFiles. Zero switches it off |
| `policy.pollBackoffMs` | `number` | no | `300000` | how long a waiting state holds before it looks again: waiting on an answer, or on a review |
| `policy.rosterBackoffMs` | `number` | no | `1800000` | how long to hold while the roster is waiting to be confirmed |
| `policy.writes` | `string` | no | `machine` | machine: amy comments, opens pull requests, requests reviews and moves the ticket to QA. operator: each of those is said to you once instead, and amy waits until it sees you made it. Nothing is written on the tracker or the code host |
| `qaStatusName` | `string` | **yes** |  | the status a ticket moves to when it is handed to QA |
| `repos` | `string[]` | **yes** |  | every repository review load is counted across |
| `reviewerHints` | `record` | no | `{}` | guidance appended to the review prompt when answering a particular reviewer, by host login |

Every field is checked at boot against the schema this package declares. A key that is
not one of the above is a refusal naming the plugin and the key, not a setting that
silently never applied.

## What it brings

| Command | What it does |
| :-- | :-- |
| `amy roster show` | Print the roster and whether it is current |
| `amy roster confirm` | Stamp the roster with today's date |

Typed on a machine that mounted this package, and unknown on one that did not.

`amy doctor` runs, after its own checks, every check this package names:

- `roster confirmed for today`

`amy init` and `amy add` write, once, into the profile's own directory:

- `roster.yaml`

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/build/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
