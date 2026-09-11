---
"@amykit/plugin-linear": patch
"@amykit/agent-kit": patch
"@amykit/workflow-ticket-to-qa": patch
---

The ticket's description reaches the agent's prompt, instead of an instruction
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