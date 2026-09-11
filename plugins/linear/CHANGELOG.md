# @amykit/plugin-linear

## 0.3.2

### Patch Changes

- 64b4d24: The answer on the ticket reaches the agent, and the tracker stops carrying
  progress notices.
  
  `hasReplyAfter` could say *whether* a ticket was answered and never *what* was
  said, so `CLARIFYING` re-ran triage on an unchanged ticket, got the same
  questions back, and asked them again until it ran out of attempts — the one
  path built for "a human knows something the ticket does not" threw that
  knowledge away on arrival. The port gains `comments(ticketId, since?)`
  returning `{ author, body, at, fromAmy }`, with `fromAmy` settled by the
  tracker's own account of who wrote each comment; `hasReplyAfter` stays as the
  cheap boolean a waiting state polls with, and still fetches no text. An
  answered question now moves the work on: the state re-reads the ticket with
  the conversation attached, amy's own comments labelled as questions it already
  asked, and the second look never repeats a question the answer closed. The
  `triage` and `implement` prompts carry that conversation, attributed.
  
  `plugin-linear` also stops contributing its notification channel: a tracker
  comment is for a question that needs a person, and `failing`, `recovered` and
  `gave-up` are for the operator's channels. That removes the pollution —
  progress notices commented on a ticket under the operator's own name — rather
  than teaching every reader to filter it. `notify.tracker` is gone with it.
- a499e82: The ticket's description reaches the agent's prompt, instead of an instruction
  to go and read a page it cannot open.
  
  `ISSUE_FIELDS` asked Linear for `id`, `identifier`, `title`, `url`,
  `branchName`, `state` and `team` — not `description` — so `Ticket` had no body
  and never could have one. `triage` and `implement` then built their prompts
  from the title and the tracker URL, and told the agent to "read the ticket":
  an instruction nothing under `claude -p` could obey, with no credential and no
  browser. The visible failure was an honest refusal; the expensive one was a
  ticket whose title sounded sufficient producing a full implementation that
  never saw the description's acceptance criteria, its named file, or the
  ownership boundary written in it — on an install where that duplicated an open
  pull request, 8 files and +615 lines on a 2-point ticket.
  
  Now the fetch asks for `description`, `toTicket` maps it to `body` (absent
  stays absent — an empty description is a real state, not an error), and the
  prompts carry the body where the work is judged by it. A ticket with no body
  says `(this ticket has no description)` rather than looking truncated, which is
  what lets the agent ask for one instead of inventing one. A tracker that
  supplies no body is unaffected: the field is optional and the prompt names the
  case it is in.
- Updated dependencies [64b4d24]
- Updated dependencies [a499e82]
  - @amykit/workflow-ticket-to-qa@0.3.2
  - @amykit/core@0.3.2

## 0.3.1

### Patch Changes

- 4b54a6f: Stop commenting machine notices on the tracker, and stop counting cache reads
  against the token ceiling.
  
  Two defects that both made the machine lie to its operator, found on the same
  day on the same install.
  
  **`notify.tracker: false` was dead configuration.** `plugin-linear` contributed
  its notification channel unconditionally and never read the setting, so every
  engine notice was commented on the Linear ticket — under the operator's own
  name, because amy authenticates with a key issued to a person, and with no
  prefix or marker because the channel posted the raw announcement text. `REVV-7716
  is moving again in DONE after 2 failed attempt(s)` reached a real ticket and a
  colleague replied to it asking what it meant. The channel is now contributed
  only when asked for, the default is off, and what it writes says a machine
  wrote it on the first line.
  
  **One agent run could park the machine for five hours.** The token ceiling
  summed `input + output + cacheRead + cacheWrite`. A single implement run
  reported `input: 44, output: 17394, cacheRead: 1839757, cacheWrite: 92769` —
  1,949,964 against a 2,000,000 per-five-hours ceiling, from a run that cost
  $0.91 against a $20 ceiling in the same window. A cache read is the saving,
  not the spend, so the better prompt caching worked the sooner the machine
  locked itself out. The ceiling now counts billable tokens; `costUsd` remains
  the ceiling that knows what cache is worth.
- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/workflow-ticket-to-qa@0.3.1
  - @amykit/plugin-notify-fanout@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e603b3b]
- Updated dependencies [7ec6c02]
  - @amykit/core@0.3.0
  - @amykit/workflow-ticket-to-qa@0.3.0
  - @amykit/plugin-notify-fanout@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/core@0.2.0
  - @amykit/workflow-ticket-to-qa@0.2.0
  - @amykit/plugin-notify-fanout@0.2.0
