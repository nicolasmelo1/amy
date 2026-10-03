---
"@amykit/core": minor
"@amykit/agent-kit": minor
"@amykit/plugin-agent-relay": minor
"@amykit/workflow-ticket-to-qa": minor
"@amykit/plugin-command-gate": minor
"@amykit/plugin-claude": minor
"@amykit/plugin-codex": minor
"@amykit/plugin-hermes-agent": minor
"@amykit/cli": patch
---

**Breaking for anyone who implements or calls the agent, the gate or a ticket. It ships in the same release as the workflow contract change, so you migrate once.**

The core's contracts carried one workflow's lifecycle into every workflow:
- The agent port had `triage`, `implement` and `addressThreads`, each taking a `Ticket`.
- The agent prepared branches, committed and pushed by itself.
- The gate took a whole `Ticket` to find a directory.
- `Ticket` required Linear's `branchName` and `team`.
- The core prescribed a pull-request title.

A workflow that pushed once per cycle had to replace the checkout to get that decision back.

- **`Agent` is `ask(prompt, cwd, context)` and nothing else.** It lives in `ports/Agent.ts`, beside `AttemptOutcome` and `Progress`.
  - The catalogue keeps `triage`, `implement` and `address-threads` as action names, so ladders, skills and budgets keyed on them are unchanged. Each now dispatches to `agent.ask`.
  - Build a step on `ask`, or with the new `implementStep` and `judgeStep` from `@amykit/agent-kit`.
- **`implementStep` commits only through a `commit` function its caller passes.** No agent touches git any more: `HarnessAgent`, `NamedAgent`, `AGENT_COLLECTION` and the `git` and `agent` options of `contributeTiers` are gone.
  - A harness plugin contributes its CLI to `HARNESS_COLLECTION` and nothing else.
  - The claude, codex and hermes-agent plugins no longer take `defaultBranch`, `baseBranch`, `checkouts` or `reviewerHints`.
- **A `config.yaml` that set `defaultBranch`, `baseBranch`, `checkouts` or `reviewerHints` under `plugins:` for a harness is now refused at boot**, naming the key. Delete it. A harness is never told where the work lives, and `reviewerHints` belongs under `agent:`.
- **`AgentRelay` is gone.** The relay mounts the `agent` port as `ask` over `HarnessRelay`, with the same skill and harness ladders, the same budget and the same boot refusals.
- **`Gate.run` takes a `Workplace`**, which is `{ repo, workId }`. It lives in `ports/Gate.ts`. `CommandGate` runs in `pathFor(repo, workId)` as before.
- **`Ticket.branchName` and `Ticket.team` are optional.** ticket-to-qa refuses a ticket without a `branchName` on its first look, naming the field.
- **`pullRequestTitle`, `TriageOutcome` and `ThreadVerdict` moved to `@amykit/workflow-ticket-to-qa`**, which now owns its prompts:
  - prompts: `triagePrompt`, `implementPrompt`, `threadPrompt`;
  - readers: `readTriage`, `readVerdicts`;
  - helpers: `branchOf`, plus the `TicketGit` type for the part of `Git` it drives.
- **`agent.reviewerHints` in `config.yaml` stays where it is.** It now reaches ticket-to-qa's review prompt instead of every harness plugin.

Eight local rules in `.software-factory/rules/` hold these decisions, and `docs/design/an-agent-only-answers.md` records them.
