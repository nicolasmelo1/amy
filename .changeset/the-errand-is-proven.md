---
"@amykit/core": patch
"@amykit/workflow-errand": patch
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
