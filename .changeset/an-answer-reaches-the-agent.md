---
"@amykit/plugin-linear": patch
"@amykit/agent-kit": patch
"@amykit/workflow-ticket-to-qa": patch
---

The answer on the ticket reaches the agent, and the tracker stops carrying
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