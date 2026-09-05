---
"@amykit/core": minor
---

A pull request carries its size, and a review too large for an agent is
handed back before one is called.

`PullRequestView` gained `changedFiles`, `additions` and `deletions`. The
forge already knew all three and was throwing them away, and fetching the diff
to work them out later costs the exact thing the number exists to avoid.

`@amykit/workflow-ticket-to-qa` uses them for two new ceilings,
`maxPullRequestFiles` (60) and `maxPullRequestLines` (2000). Past either, a
review is escalated to the ticket owner instead of handed to an agent —
naming which ceiling was passed and by how much, because "I am not doing this
one" without a number is a refusal nobody can act on. Zero on either switches
it off.

The point is *when* it refuses. The decision is a pure predicate over a
number the observation already carried, so it costs nothing at the one moment
where making the call would have cost the most. A five-hundred-file review is
where an agent is least likely to help and most likely to be expensive about
it, and three attempts before giving up is the worst of both.

It reuses `ESCALATED` rather than adding a state: that state already means
"this needs the person whose ticket it is", which is exactly what a change
nobody should automate needs. It escalates once and then holds, rather than
filing the same thing on every look.
