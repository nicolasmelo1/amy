# ticket-to-qa

This workflow walks a ticket from your tracker's working status to a QA handoff: clarify, implement, check, open the pull request, get it reviewed, hand it on.

Move a ticket to the working status and amy picks it up. It asks you when the
ticket is unclear, has an agent write and review the change, runs your checks,
answers automated and human review, and moves the ticket to QA once it is
approved. When it is stuck, it tells you and waits.

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

- **CLARIFYING** asks in the ticket's thread and waits for your answer.
- **GATE** and **SELF_REVIEW** run side by side as lanes and meet at one
  verdict; either finding something sends the work back to IMPLEMENTING. Why:
  [a workflow runs on lanes](../../docs/design/a-workflow-runs-on-lanes.md).
- **COPILOT_WAIT** settles automated comments before a person is asked.
- **REVIEWER_ASSIGNED** picks a reviewer from today's roster.
- **ESCALATED** is reachable from several states: every agent attempt failed,
  the checks stayed red, the change grew too large, or a comment needs the
  ticket's owner. Once you answer, it returns to where it stopped.

## Try it

```sh
amy add @amykit/workflow-ticket-to-qa
amy roster confirm
amy doctor        # names what is still missing
amy tick          # one move at a time, so you can watch it
```

It needs a tracker such as `@amykit/plugin-linear`, a code host such as
`@amykit/plugin-github`, an agent such as `@amykit/plugin-claude`, a gate such
as `@amykit/plugin-command-gate`, and a notifier. `qaStatusName` and `repos` are
required. The roster in `roster.yaml` is confirmed each day, so nobody is asked
to review on a day off: [the roster belongs to its
workflow](../../docs/design/the-roster-belongs-to-its-workflow.md). With
`policy.writes: operator`, amy writes nothing to the tracker or code host and
tells you each move to make instead. Why: [a private workflow composes the
shipped one](../../docs/design/a-private-workflow-composes-the-shipped-one.md).

<!-- amy:generated reference -->

## Install

```sh
amy add @amykit/workflow-ticket-to-qa
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

`amy add` writes, once, into the profile's own directory:

- `roster.yaml`

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/guides/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
