---
"@amykit/core": patch
"@amykit/workflow-errand": minor
---

**An errand that answered a question is not delivered as an empty pull
request.**

`run-errand` decided whether the errand had changed something by asking
whether the push had moved the remote. `prepareBranch` has already created
the branch, so publishing it for the first time is a new remote ref whether
or not it carries a commit — a question reached `PR_OPEN` with no diff in it.
`Git` grows `commitsAhead(repo, of, workId)`, and the errand commits, asks
that question and only pushes when there is something to review; the branch
of an errand that changed nothing stays local.

**An errand the agent refuses is declined at once, with its reason.** The
prompt already asked the agent to say so plainly when a sentence could not be
done as asked, but nothing read it. A refusal that changed nothing landed in
`DONE` as if it were an answer, and one that came back as an error was retried
until the attempts ran out. A refusal now ends with one line,
`{"declined": "why"}`. The errand reads that line and goes from `WORKING` to
`DECLINED` without another attempt, telling the operator the reason.
Nothing the agent left in the tree is published.
