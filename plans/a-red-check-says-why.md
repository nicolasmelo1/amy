---
base: 3fee6a5ce1a6dedd1039e0cf4007659e7c0536e2
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/CodeHost.ts", symbol: "ChecksView", said: "what the forge's checks say is a state and the commit they ran on; nothing names a check, a link or why it failed" }
  - { id: S2, kind: code, ref: "plugins/github/src/GitHubCodeHost.ts", symbol: "toChecks", said: "the GitHub host asks statusCheckRollup for its state only, never its contexts" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/src/machine.ts", symbol: "whatTheForgeSays", said: "red checks become `the checks on <sha> are red`, and REVIEWER_ASSIGNED hands the branch to the owner" }
  - { id: S4, kind: friction, said: "2026-11-12: TBO-1391/WORK#1 escalated with only `the checks on 21e5a29 are red`; neither the owner nor an agent was told which check failed or why" }
  - { id: S5, kind: reference, ref: "packages/test-fixtures/contracts/github.graphql", symbol: "CheckRun", said: "a check run carries name, conclusion, detailsUrl, title, summary, text, databaseId and annotations (path, location, message, level); a StatusContext carries context, state, targetUrl, description" }
  - { id: S6, kind: reference, ref: "https://docs.github.com/en/rest/actions/workflow-jobs#download-job-logs-for-a-workflow-run", said: "GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs answers 302 to a plain-text log whose link lasts one minute" }
  - { id: S7, kind: reference, ref: "https://docs.github.com/en/rest/checks/runs#list-check-run-annotations", said: "annotations come at most 50 a request; Actions writes at most 10 warning and 10 error annotations per step" }
  - { id: S8, kind: reference, said: "the plan Outside text reaches the agent as data (PR 217, not yet on main): outside text reaches a prompt inside one closed envelope, cut at a limit" }
  - { id: S9, kind: decision, said: "any code host shows which checks failed, so the agent can implement the fix; GitHub first. Decided 2026-11-12" }
  - { id: S10, kind: decision, said: "ChecksView gains the failing checks: name, link, conclusion, summary, annotations and a log tail, each bounded: ten checks, twenty annotations, the last 80 lines or 8000 characters of a log. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "red checks at REVIEWER_ASSIGNED go to a new CHECKS_FIX state where the agent fixes and pushes; it escalates only when nothing failing can be read or its attempts are spent. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "a log tail is read only for a GitHub Actions run, by the job id the check run's databaseId is; the work confirms that on a recorded run first. Proposed 2026-11-12" }
  - { id: S13, kind: code, ref: "packages/core/src/ports/CodeHost.ts", symbol: "ReviewSubmission", said: "a review is its author, state, commit and time; the GitHub host's reviews query asks for no body, so nothing a review wrote reaches a workflow" }
  - { id: S14, kind: friction, said: "2026-11-12: an automated reviewer keeps its verdict only in the review's body, `🟢 Approval recommended`; the CodeHost port does not expose it, so a project needed a small port of its own" }
  - { id: S15, kind: reference, said: "read 2026-11-12 from amy's own pull requests: every Copilot review is COMMENTED; its body opens `<!-- ccr-overview-v2 -->` then `### 🟡 Changes recommended` (155), `### 🔵 Needs a closer look` (69) or `### 🟢 Approval recommended` (43)" }
  - { id: S16, kind: reference, said: "read 2026-11-12 from amy's own pull requests: 18 Copilot reviews say only that it was unable to review because the requester has insufficient remaining quota" }
  - { id: S17, kind: code, ref: "examples/workflow-ticket-to-qa/src/machine.ts", symbol: "planAutomatedReviewWait", said: "once the automated reviewer saw the head, no open thread moves the work to REVIEWER_ASSIGNED; its verdict is never read" }
  - { id: S18, kind: decision, said: "the CodeHost port exposes more of what the forge says: a review's verdict too, not only checks. Decided 2026-11-12" }
  - { id: S19, kind: decision, said: "a review gains its body, cut at 8000 characters, and an optional recommendation the host plugin reads from a reviewer it knows: approve, changes, closer-look or unavailable; the core names no reviewer. Proposed 2026-11-12" }
  - { id: S20, kind: decision, said: "ticket-to-qa reads it at COPILOT_WAIT: changes goes to COPILOT_FIX even with no open thread, closer-look and approve go on with the note, unavailable stops waiting and says why. Proposed 2026-11-12" }
touches:
  - packages/core/src/ports/CodeHost.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - packages/test-fixtures/src/builders.ts
  - plugins/github/src/GitHubCodeHost.ts
  - plugins/github/tests/GitHubCodeHost.test.ts
  - plugins/github/tests/checks.property.test.ts
  - plugins/github/tests/fixtures/rollup-failing.json
  - plugins/github/tests/fixtures/job-log-failing.txt
  - plugins/github/tests/fixtures/copilot-reviews.json
  - plugins/github/tests/reviews.property.test.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/effects.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/agent-steps.ts
  - examples/workflow-ticket-to-qa/tests/machine.test.ts
  - examples/workflow-ticket-to-qa/tests/conformance.test.ts
  - examples/workflow-ticket-to-qa/tests/walkthrough.test.ts
  - examples/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - examples/workflow-ticket-to-qa/README.md
  - docs/reference/workflows.md
  - docs/concepts/workflows.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/red-checks-scenario.sh
criteria:
  - { id: A1, statement: "the recorded failing rollup reads as failing checks with name, link, conclusion, summary and annotations with path and line; passing and pending checks are left out", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S1, S2, S5, S9, S10] }
  - { id: A2, statement: "a red StatusContext reads as a failing check with its context, target link and description, and no annotations", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S5] }
  - { id: A3, statement: "the query that reads them validates against the vendored github.graphql", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S5] }
  - { id: A4, statement: "for any rollup, at most ten failing checks, twenty annotations each and an 8000-character log tail are kept, and a cut says how much was left out", proof: "deferred:property:plugins/github/tests/checks.property.test.ts#bounds_dropped", sources: [S7, S10] }
  - { id: A5, statement: "an Actions check's log tail comes from its job's log, the recorded log's last failing lines; a non-Actions check or a refused log read keeps the rest and says so", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S6, S12] }
  - { id: A6, statement: "REVIEWER_ASSIGNED with red checks that carry something to read goes to CHECKS_FIX, not ESCALATED", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S3, S4, S11] }
  - { id: A7, statement: "the CHECKS_FIX prompt names each failing check, its link, annotations and log tail inside envelopes, and asks for a fix on the branch", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S8, S9] }
  - { id: A8, statement: "a pushed fix goes back to wait for the checks on the new head; red again after the attempts are spent escalates, naming each check that stayed red", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/walkthrough.test.ts", sources: [S4, S11] }
  - { id: A9, statement: "red checks with nothing to read escalate as today, now naming the checks and their links", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S3, S11] }
  - { id: A10, statement: "an escalation for red checks names every failing check and its link, so the owner reads why without opening the forge", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts", sources: [S4, S9] }
  - { id: A11, statement: "the built GitHub plugin and ticket-to-qa, in another process, read the recorded rollup and log into a CHECKS_FIX prompt naming the failing check", proof: "assertion:checks.a_red_check_reaches_the_agent", sources: [S4, S9] }
  - { id: A12, statement: "a review carries its body, cut at 8000 characters saying how much was cut, and the reviews query that reads it validates against the vendored github.graphql", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S13, S18, S19] }
  - { id: A13, statement: "the recorded Copilot reviews read as approve, changes, closer-look and unavailable, one each; any other author's review carries no recommendation", proof: "deferred:test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S14, S15, S16, S19] }
  - { id: A14, statement: "for any body, a recommendation is read only from the overview marker followed by a known heading, or the quota sentence; anything else reads as none", proof: "deferred:property:plugins/github/tests/reviews.property.test.ts#heading_read_without_marker", sources: [S15, S16, S19] }
  - { id: A15, statement: "at COPILOT_WAIT, changes on the head goes to COPILOT_FIX with the overview inside an envelope even with no open thread; approve and closer-look go to REVIEWER_ASSIGNED, closer-look's note said to the owner", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S8, S17, S20] }
  - { id: A16, statement: "unavailable on the head stops the wait and goes to REVIEWER_ASSIGNED, saying the automated review could not run and why, instead of waiting for a review that will not come", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/walkthrough.test.ts", sources: [S16, S20] }
  - { id: A17, statement: "the built GitHub plugin and ticket-to-qa, in another process, read the recorded Copilot reviews and move a work at COPILOT_WAIT as A15 and A16 say", proof: "assertion:reviews.an_automated_verdict_moves_the_work", sources: [S14, S18] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:test:packages/core/tests/ports.test.ts; ChecksView and ReviewSubmission grow optional fields and no write is added" }
  - { mechanism: diagram, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts" }
  - { mechanism: record-migration, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts; a record saved at REVIEWER_ASSIGNED or ESCALATED for red checks reads and moves the same" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A7" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A8, A16" }
guarantee:
  - { holds: "a red check the forge explains reaches the agent and the owner with its name, link and why, cut to a known size", not_against: "a check whose only explanation is behind a login the token cannot read" }
  - { holds: "a code host that reports no failing detail behaves as today", not_against: "a host plugin that never fills the new field" }
  - { holds: "an automated reviewer's verdict on the head decides where the work goes, and a reviewer that cannot run never holds the work", not_against: "a reviewer that changes its body's wording: it reads as no recommendation, as today" }
failures:
  - { step: read checks, when: "the rollup lists more checks than one page holds", goes_to: "the first page is kept and the cut is said" }
  - { step: log tail, when: "the log is gone, expired or refused", goes_to: "the check keeps its summary and annotations, and says the log could not be read" }
  - { step: CHECKS_FIX, when: "the agent changes nothing", goes_to: "an attempt is spent; spent attempts escalate naming the checks" }
cut:
  - "a check that is flaky rather than red: rerunning it is another plan"
  - "code hosts other than GitHub: each fills the field in its own plugin"
  - "automated reviewers other than Copilot: each is one reader in its host plugin"
exit: "a pull request whose CI fails on a lint error goes to CHECKS_FIX, the agent's prompt names the check, the file and line, the fix is pushed and the branch moves on without the owner"
---
# A red check says why

When the forge's checks fail, amy only knows that they are red, and an
automated reviewer's verdict sits in a review body nobody reads. This plan
has the code host report which checks failed and why, and what a reviewer
recommended, within bounds, and gives the agent a turn before it escalates.
