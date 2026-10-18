---
"@amykit/core": minor
"@amykit/workflow-ticket-to-qa": minor
"@amykit/plugin-github": minor
"@amykit/plugin-linear": minor
"@amykit/plugin-file-queue": minor
"@amykit/plugin-serial-engine": minor
"@amykit/workflow-errand": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/cli": patch
---

What a private workflow had to write for itself, the shipped one now does.

- A commit status GitHub returns in lower case reads as passing or failing; every one used to read as running.
- `Git` commits without pushing, and `push` refuses anything that is not a fast-forward, naming the branch. `commitAndPush` is built on the two.
- A review thread carries the file it is on.
- The code host finds a pull request by the id in its title, open or merged, and the author's pull requests somebody asked to change. A workflow that claims no writes is handed `pullRequestAncestry` and both of these.
- `ticket-to-qa` takes `policy.writes: operator`: every tracker and code-host write is said once, in the work's thread or through the notifier, and the machine waits until it sees it made. The workflow then claims no writes at all.
- A ticket Linear labels into several repositories (`repoByLabel`) is one work item per repository, `TICKET@owner%2Fname`, and QA receives it once, when every one has merged.
- `file-queue` takes `order: priority`: the most urgent due item first, first in first out within one priority, refreshed on every discovery from the tracker's own urgency.
