# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows are numbered for reading order only. The paragraphs below name plans
rather than numbers, because a delivered row renumbers every row after it and
prose that cited numbers went stale silently every time — which it had, in four
places, before this was written down.

**From one day of writing a workflow against this codebase and breaking it
eight times.** *A testkit proves the machine* and *the guardrails ship with the
workflow*, both delivered, and *work that is over goes away* are additive and help somebody who
already has a workflow. *The workflow contract changes once*, delivered, was
the pair of breaking changes that day produced, taken together in one release
so no author migrates twice.

**From a day of a private workflow driving this machine against real pull
requests.** *No port method ships unproven* comes before *an escalation can be
withdrawn*, because the second adds methods and a view to one port and every
one of them should have to get past the first on arrival.

**From that workflow's day on real tickets.** *No retry is free*, now
delivered at `docs/design/no-retry-is-free.md`, made opted-in workflows refuse
a retry that adds no evidence before another agent starts. It followed the
worktree work: a workflow should not learn to count no-evidence retries
against a tree two tickets can still contend for.

**From a third day, driving real reviews.** *A review thread can be replied to*
is the write the code host never had. *A strong model reads the review first*
orders after it because its verdicts land through that reply; *the review is
remembered across rounds* orders after that because the triage reads the memory
it keeps; *a picture is a comment too* is independent of the three and last
only because it ships beside them. *A review finding outlives the review*
follows all of them, because they produce and classify the outcomes it
preserves.

**Two configurable choices found after the thread-closing capability shipped.**
*A child carries its roots* makes the tracker's project and ancestor context
available before any review step consumes a partial ticket; *an answered thread
closes by policy* turns a hard-coded closing decision into policy. Separate
rows because one grows the tracker and agent context seam and the other changes
a workflow decision.

**From four issues filed against this repository itself.** *The performance
guard can fail* comes first and is small: a guard that cannot go red is the
gate every other row's proof rides on. *Grooming reads the code it is about*
was delivered as `docs/design/grooming-reads-the-code-it-is-about.md`: it reads
configured base-branch snapshots without changing standing checkouts, and only
reconciles work carrying its own provenance. *A project is three phases* is the
slot, and *a phase is proven, not asserted* is what goes in the third one, so
it follows.

**From auditing what the gates actually watch.** *The errand is proven end to
end* is the third shipped workflow's missing scenario: `amy btw` is the shortest
road into this machine and the only one of the three whose source cannot expire
a proof by changing. It sits beside *the performance guard can fail* because
both are the same defect seen twice — a gate that reads like protection and
cannot report the day it stops being any.

**The next release: the smallest workflow.** The rows up to *a project is three
phases* are chosen by one question — what does a workflow somebody wrote themselves still have to
carry that the machine should — and by one operator's request that the machine
write nothing where anybody else reads. *A testkit proves the machine*, delivered,
took the fake world; *the guardrails ship with the workflow*, delivered, took the
three rules every private workflow ends up writing. *The workflow contract changes once*,
delivered, and *a workflow that claims no writes cannot reach one* are both
breaking changes to what a workflow declares, so they ship in the same release
and an author migrates once. *No port method ships unproven* comes before the new port, so the
`conversation` port has to get past that guardrail on arrival. *No retry is
free* and *a stack knows its parent* take the retry counter and the stack
resolution out of the workflows that wrote their own. *An answer arrives where
the question was asked* and *a Slack thread per piece of work* give the operator
somewhere to be asked that is not the tracker. *A project is three phases*
closes the block: it is what moves a brief's checks out of the execution
workflow and into a phase of its own. Everything after it keeps the order it
had.

**From a private workflow five times the size of the shipped one.** *A private
workflow composes the shipped one* is every gap that made one private workflow
re-write the machine instead of configuring it: a commit status that never
reads as passing, a commit that cannot happen without a push, review threads
with no file, code-host reads by ticket, a shipped lifecycle that can only write
in public, and one ticket held in one record across two repositories. It sits
after *a phase is proven, not asserted* because it is the release after that
one, and its rows are independent of each other — the first is a bug fix and
can go any time.

**From planning a workflow that drives plans, not tickets.** One operator
wants a private workflow to walk the rows of `next-steps.md` across three
repositories, on two subscriptions, asking them once and over Telegram. Five
seams stand in the way, and each is useful to anybody else. *A usage limit is
not an attempt* comes first because it is a defect today: a workflow allowing
two attempts loses them to the clock. *Decisions are asked in a batch* is a
policy on the review loop that already exists. *A row of next steps is a
ticket* is what lets `ticket-to-qa` walk a plan at all. *Grooming reads the
sections its workflow declares* is what fills the brief that walk needs, and
*Telegram is a conversation* is the last because GitHub already carries every
question while it is missing.

**First, before the window: an update reaches the release.** *An update
reaches the release* is [#110](https://github.com/nicolasmelo1/amy/issues/110):
`amy update` reported `nothing to move` with the release published, because a
0.x caret never crosses a minor and a global CLI read as a checkout. It comes
before every other row, the 0.7 block included, because every machine that
installs 0.7 gets there through this command; it depends on nothing, and its
gate is the same defect as *the performance guard can fail* — a scenario that
stubs out the very thing it claims to prove.

**amy 0.7: a window.** These rows come before every other row in the table but the first,
and they are what 0.7 ships. One operator asked for a window: a list on the left, the work on the right, a
conversation always at hand, and plugins for everything beyond that. *A
question is not an answer*, delivered, came first and waited for no window:
a reply in a Slack thread resumed escalated work, so there was no discussion
before the machine acted, and the window would have inherited the defect.
*The event log can be watched* and *a view is data*, both delivered, are the
two foundations, and neither knows a window exists. *The frame is closed*,
delivered, came before any window is drawn: nothing in this repository had
ever had a window to gate, and the wireframe had to be a locked file with every
renderer measured against it before the first renderer existed, or the first
renderer would have become the definition. *The server speaks in domains* and *every endpoint is named
before it is built* come next: the shape of the server — one folder per
domain, one controller per operation with its own request and response — and
the list of every operation it will ever have in this block, each held by a
rule before any of them exists, so eight rows built on eight days add to one
surface instead of growing four. *The window is served* and *a renderer is
chosen by name* follow, before any real renderer: a client that speaks only to a server is what
makes a renderer on another machine, or a phone, cost a client rather than a
host; and a renderer found by name, with only `text` in the bare install, is
what keeps every later renderer a plugin rather than a flag. Every row after
it adds to its conformance world and is proven by
its `ui-frame` gate and the `ui-window` gate beside it. *amy has a window* is
the small one that ships, and it is a desktop app — macOS first, Windows and
Linux the same app later — because a page in a browser tab has no menu bar, no
global shortcut and a port to guard, and because Electron's own Chromium makes
the engine the gate measures the engine that ships. *amy lives in the menu bar*
comes straight after it: most of the time a person wants to know whether
anything needs them, not to open a window, and it is the same views on a
second surface; *the window takes plugins* comes straight after,
because every row behind it adds a tab, a panel or an opener through the collections it opens.
*A conversation before the work* is the window's half of the first row.
*Grooming reads the sections its workflow declares* is pulled forward from the
plan-driven block into this one, because *grooming happens in the window* runs
the skill it ships and cannot come before it. *The workplace opens where you
work* and *looks are configuration* are independent of each other and
additive. *The window fits a terminal* — driven like Neovim, and by the mouse — is last
because it is the one row that depends on everything before it: until it lands, the rows prove renderer
agreement against the two stub renderers *the frame is closed* shipped, and the
terminal-only behaviour — suspending the window for an editor — is its own. A phone is
not a row yet: with the server, it is one more client built with
`amy ui build`, and costs nothing to plan until two renderers have proven the
views are renderer-free.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [An update reaches the release](an-update-reaches-the-release.md) | A machine on the last release, its CLI installed with `npm install -g`, runs `amy update` once and ends on the current release in both roots, one version throughout — proven against a registry that resolves ranges for real |
| 2 | [The server speaks in domains](the-server-speaks-in-domains.md) | With `core/` and one example domain in a mutation fixture, `sf verify` shows each of the five rules tripping on its fixture, and the clean tree builds a document every rule accepts, with no database anywhere — before *the window is served* adds its first real domain |
| 3 | [Every endpoint is named before it is built](every-endpoint-is-named-before-it-is-built.md) | `surface.yaml` holds every operation in this plan as `planned`, the gate is green on a server with no domains, and flipping any one entry to `delivered` without its controller turns the build red naming it |
| 4 | [The window is served](the-window-is-served.md) | A field removed from a server response turns the build red in the renderer that read it, before anything runs; and with it restored, `amy serve` runs on one machine; on a second, with no amy state and only the server's URL and token, `amy ui text --server <url>` shows the first machine's work moving, and a `poke` from it moves the record there — while a shell, asked for from the second machine through a tunnel, does not exist on its transport |
| 5 | [A renderer is chosen by name](a-renderer-is-chosen-by-name.md) | On the bare install, `amy ui` opens the text renderer against the local server; a packaged fixture renderer installed by name from outside this repository opens with `amy ui fixture` and as `ui.default`, `amy ui text` still opens the text one, and the fixture is driven by the frame's script with neither the script nor the frame edited |
| 6 | [amy has a window](amy-has-a-window.md) | On a Mac, with the daemon running, a person runs `amy plugin add @amykit/ui-desktop`, opens `amy ui desktop`, watches a ticket go from `DISCOVERED` to `IMPLEMENTING` without touching anything, pokes another from its `⋯`, and breaks `config.yaml` in Settings without breaking the install — and `sf check` is green on `ui-frame` and `ui-window` |
| 7 | [amy lives in the menu bar](amy-lives-in-the-menu-bar.md) | On a Mac, with the window closed, a ticket escalates; the menu bar's count goes from 0 to 1 and a notification arrives; choosing it opens the window on that ticket — and the menu bar's projection on every step equals the locked golden |
| 8 | [The window takes plugins](the-window-takes-plugins.md) | A plugin written outside this repository adds a nav 1 section, a canvas tab and a `⋯` action, installed with `amy plugin add`, and none of the three appears until it is mounted — and each lands in the same place in the desktop app and the text renderer |
| 9 | [A conversation before the work](a-conversation-before-the-work.md) | A person asks four questions about an escalated record in `⌘K` on one harness and a fifth on another, then discusses it in the thread panel, decides, and the record moves only at the decision |
| 10 | [Grooming reads the sections its workflow declares](grooming-reads-the-sections-its-workflow-declares.md) | A workflow declaring four sections and a check gets a brief groomed by the shipped `amy-groom` from an agent that is not the one running amy, stored through the brief port, and `amy brief check` green on it |
| 11 | [Grooming happens in the window](grooming-happens-in-the-window.md) | A person picks an existing ticket in the window, is asked about each declared section until `amy brief check` is green, moves it to the working status by hand, and amy builds it with that brief — no tracker write made by amy anywhere in the call log |
| 12 | [The workplace opens where you work](the-workplace-opens-where-you-work.md) | From one record, a person reads its diff in the window, opens `nvim` on its checkout in the app's terminal, and a second person on the same install opens the same checkout in VS Code — with neither of them typing a path |
| 13 | [Looks are configuration](looks-are-configuration.md) | A person switches the window to a theme a plugin contributed, recolours one state of one workflow, and the escalated records are still the ones that stand out |
| 14 | [The window fits a terminal](the-window-fits-a-terminal.md) | A person runs `amy ui terminal`, follows a record to `ESCALATED`, discusses it in the right panel, decides, and opens its checkout in `nvim` — never touching the arrow keys, and clicking where a click is quicker — and the projection of every step is the desktop app's |
| 15 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 16 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 17 | [Work that is over goes away](work-that-is-over-goes-away.md) | A record that ended leaves the disk on its own, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 18 | [An escalation can be withdrawn](an-escalation-can-be-withdrawn.md) | A record that escalated on a defect comes back by a command — counter honest, history truthful, and the daemon never once raced the repair |
| 19 | [A skill for the half-step](a-skill-for-the-half-step.md) | A workflow that phases one action into several steps can give each of them its own skill and its own model ladder, from `config.yaml`, with the typos refused at boot by name |
| 20 | [A review thread can be replied to](a-review-thread-can-be-replied-to.md) | A workflow that owes a reviewer an answer can write it inside the thread the reviewer opened, and the next look reads it back as part of the conversation |
| 21 | [A child carries its roots](a-child-carries-its-roots.md) | One leaf ticket can carry its project and every parent to all agent steps, including self-review, when configured; the same install can turn that context down or off |
| 22 | [An answered thread closes by policy](an-answered-thread-closes-by-policy.md) | An operator independently chooses whether answered automated and human threads close, changes that choice on remount, and the remote mutations match it exactly |
| 23 | [A strong model reads the review first](a-strong-model-reads-the-review-first.md) | A workflow that wants a strong model reading its reviews before the executor is spent can say so with one action, one ladder key and one state — and the review arrives with the whole ticket behind it |
| 24 | [The review is remembered across rounds](the-review-is-remembered-across-rounds.md) | What a review settled, deferred or answered is remembered with the evidence it was settled on, and a thread only becomes work again when somebody says something new in it |
| 25 | [A picture is a comment too](a-picture-is-a-comment-too.md) | A comment that arrives with a picture is a comment the agent can see, on Linear or GitHub alike, and no workflow has to know that pictures were ever missing |
| 26 | [A review finding outlives the review](a-review-finding-outlives-the-review.md) | Review and self-review findings survive finished work in one queryable corpus with their mechanical outcomes, repeated collection is idempotent, contradictions are visible, and no machine surface can fill the human verdict or evidence that would turn an anecdote into a rule |
| 27 | [The performance guard can fail](the-performance-guard-can-fail.md) | A commit that makes the budget ledger twenty times slower turns this repository's build red naming the benchmark, and the same gate goes red the day somebody replaces the comparison with a command that only reports. |
| 28 | [The errand is proven end to end](the-errand-is-proven-end-to-end.md) | Editing the errand workflow or the task store turns `sf check` red until the errand scenario is run again and resealed, the same way the other two shipped workflows already behave |
| 29 | [A phase is proven, not asserted](a-phase-is-proven-not-asserted.md) | A unit of work whose scenario names no example cannot leave planning, a phase whose run left one assertion unevaluated is refused with that assertion named, a person's manual run locks a unit as proven, and a proof whose code or brief has since changed goes red without anybody looking. |
| 30 | [A usage limit is not an attempt](a-usage-limit-is-not-an-attempt.md) | A workflow allowing two attempts, on a single Codex rung, survives any number of usage limits and escalates only after two runs that actually failed |
| 31 | [Decisions are asked in a batch](decisions-are-asked-in-a-batch.md) | Under `policy.decisions: batch`, three review rounds that find one, one and zero decisions reach the owner as one message carrying the two that still apply, after the third round and not before |
| 32 | [A row of next steps is a ticket](a-row-of-next-steps-is-a-ticket.md) | `ticket-to-qa`, mounted on a `next-steps.md` table, takes its first row from the base branch, walks it to a pull request in the repository the row's plan lives in, and writes nothing anywhere a tracker would have been |
| 33 | [Telegram is a conversation](telegram-is-a-conversation.md) | A work item's question reaches its own Telegram topic, the process restarts, the operator answers in that topic, and the same work item — and no other — reads the answer and moves on |

**Delivered:** *A question is not an answer* now lives at `docs/design/a-question-is-not-an-answer.md`.

**Delivered:** *A private workflow composes the shipped one* now lives at `docs/design/a-private-workflow-composes-the-shipped-one.md`. Its last criterion is the private workflow's own to measure.

**Delivered:** *An agent only answers* now lives at `docs/design/an-agent-only-answers.md`.

**Delivered:** *A snapshot is a commit* now lives at `docs/design/a-snapshot-is-a-commit.md`.

**Delivered:** *A Slack thread per piece of work* now lives at `docs/design/a-slack-thread-per-piece-of-work.md`.

**Delivered:** *An answer arrives where the question was asked* now lives at `docs/design/an-answer-arrives-where-the-question-was-asked.md`.

**Delivered:** *A project is three phases* now lives at `docs/design/a-project-is-three-phases.md`.

**Delivered:** *A stack knows its parent* now lives at `docs/design/a-stack-knows-its-parent.md`.

**Delivered:** *The guardrails ship with the workflow* now lives at `docs/design/the-guardrails-ship-with-the-workflow.md`.

**Delivered:** *The workflow contract changes once* now lives at `docs/design/the-workflow-contract-changes-once.md`.

**Delivered:** *A workflow that claims no writes cannot reach one* now lives at `docs/design/a-workflow-that-claims-no-writes-cannot-reach-one.md`.

**Delivered:** *A testkit proves the machine* now lives at `docs/design/a-testkit-proves-the-machine.md`.

**Delivered:** *A spec is a name, a URL or a path* now lives at `docs/design/a-spec-is-a-name-a-url-or-a-path.md`.

**Delivered:** *Plugins live where amy can see them* now lives at `docs/design/plugins-live-in-amy-home.md`.

**Delivered:** *Amy add and amy remove* now lives at `docs/design/amy-add-and-amy-remove.md`.

**Delivered:** *Amy update* now lives at `docs/design/amy-update.md`.

**Delivered:** *A workflow is yours, not a package* now lives at `docs/design/a-workflow-is-yours-not-a-package.md`.
