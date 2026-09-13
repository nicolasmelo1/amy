---
"@amykit/core": patch
"@amykit/plugin-github": patch
"@amykit/workflow-ticket-to-qa": patch
---

The threads close when they are answered.

`CodeHost` carried no way to settle a review conversation, so a workflow
state whose exit reads "no open thread" could not reach its own exit: the
code was fixed, the forge kept the thread open, and a ticket that had done
nothing wrong escalated at the ceiling. The port grows
`resolveReviewThread` and `unresolveReviewThread` — one id, one call — the
GitHub adapter runs the `resolveReviewThread`/`unresolveReviewThread`
GraphQL mutations through the scripted runner, and the action catalogue
grows `resolve-review-thread`, dispatched to the code-host port, so a mount
that cannot run it is refused at boot by name.

The ticket-to-qa machine presses the button where the gap was: inside
`COPILOT_FIX`, threads the record judged `fixed` and the forge still holds
open get one act of `resolve-review-thread` each, and the next look finds
them resolved and leaves through the exit condition instead of through the
attempts. Who may close what stays the workflow's policy — only the
automated reviewer's threads, only the ones the machine itself answered,
and never a colleague's; `HUMAN_FIX` does not emit the effect at all.