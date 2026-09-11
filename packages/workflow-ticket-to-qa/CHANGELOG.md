# @amykit/workflow-ticket-to-qa

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
- @amykit/core@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1

## 0.3.0

### Minor Changes

- 7ec6c02: Nothing is installed by default: the command arrives alone, the first workflow is the one the person there names or writes.
  
  `@amykit/cli` depends on no workflow and no notifier. The roster the ticket workflow reads is contributed by the host under the name the workflow looks up — spelled where the file is read, not imported — and whether a Hermes target is reachable is asked of the `notify` port the mounted channel contributes.
  
  `SHIPPED_PROFILES` is empty: a config with no `workflows:` block drives nothing, and every command that needs one says so and names `amy workflow new` and `amy add`. `EXAMPLE_CONFIG` keeps the two published workflows as commented examples, its plugin slices commented with them, and `amy init` writes its files and installs nothing. A machine with nothing mounted is still diagnosed: `amy doctor` reports everything it can see and names the missing workflow in the selection's own words.
  
  New gate `bare-install`: the scenario installs the command alone onto a machine with none of it and proves what it can and cannot do — twelve assertions, from "the command arrives alone" to "doctor asks the port, not the package".

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0

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
