---
sources:
  - { id: S1, kind: code, ref: "plugins/linear/src/LinearTracker.ts", said: "the issue query asks for ISSUE_FIELDS and toTicket copies only those; a grandchild arrives like a root, its project, parent and root never reaching the agent" }
  - { id: S2, kind: ticket, ref: "issue #54", said: "complete ancestry when wanted — project, parent, grandparent, until the root — and no automatic expansion when not; siblings and descendants are not ancestors" }
  - { id: S3, kind: code, ref: "packages/workflow-ticket-to-qa/src/ticket.ts", said: "Ticket has no place for context; each agent step renders the ticket itself, and a generic self-review half-step would miss a fix to only the ticket prompts" }
  - { id: S4, kind: decision, said: "Ticket gains optional context: readonly WorkContext[], each naming kind (project|ancestor), stable id, title, URL, optional body; body stays exactly the ticket's own description" }
  - { id: S5, kind: decision, said: "ancestors are root-first and end at the immediate parent, so the prompt reads intent to leaf without a parent posing as the child's specification" }
  - { id: S6, kind: decision, said: "WorkContext lives with the agent/harness contract, not Linear; AskContext.workContext carries it for generic calls; one agent-kit renderer serves every step; the relay facade passes it at both levels" }
  - { id: S7, kind: decision, said: "@amykit/plugin-linear slice: contextProject boolean, default false; contextAncestors none|parent|root, default none; parent fetches exactly the immediate parent; root follows every parent, no depth limit" }
  - { id: S8, kind: decision, said: "the project is the first found from child toward root, received once; defaults keep today's request count and prompt exactly: context is not automatic" }
  - { id: S9, kind: decision, said: "ConfigSchema cannot prove an enum, so the plugin parses contextAncestors in ready and refuses any other value before asking for a ticket; parsed settings pass into LinearTracker" }
  - { id: S10, kind: decision, said: "the first query returns parent id and project; root follows parent ids iteratively, recording visited ids, refusing a cycle by name; inProgress and get share one context builder" }
  - { id: S11, kind: decision, said: "nothing is copied into the work record; after a config edit and restart the next observation rebuilds the ticket under the new setting" }
  - { id: S12, kind: decision, said: "gate ticket-to-qa extended: a project, chain ROOT-1 -> PARENT-2 -> CHILD-3, a misleading sibling; the fake harness records every prompt incl. self-review; runs the installed machine under several Linear configs" }
  - { id: S13, kind: decision, said: "changed-config assertion: write none, see a prompt without roots, stop, write root, see the next prompt with both ancestors — edit and remount, not hot reload" }
  - { id: S14, kind: decision, said: "the gate also asserts context.an_unknown_ancestry_scope_is_refused_before_work" }
touches:
  - plugins/linear/src/LinearTracker.ts
  - plugins/linear/src/plugin.ts
  - plugins/linear/src/config.ts
  - plugins/linear/tests/LinearTracker.test.ts
  - packages/core/src/ports/Harness.ts
  - packages/workflow-ticket-to-qa/src/ticket.ts
  - packages/core/src/ports/Ticketing.ts
  - packages/workflow-ticket-to-qa/src/agent-steps.ts
  - packages/agent-kit/src/HarnessRelay.ts
  - plugins/agent-relay/src/plugin.ts
  - .software-factory/evidence/ticket-to-qa-scenario.sh
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "with the default Linear config, neither project nor ancestry is queried or rendered", proof: "assertion:context.the_default_fetches_no_project_or_ancestor", sources: [S7, S8, S12] }
  - { id: A2, statement: "contextAncestors: parent includes the immediate parent and stops there", proof: "assertion:context.parent_fetches_exactly_one_parent", sources: [S7, S12] }
  - { id: A3, statement: "contextAncestors: root includes every ancestor, root first, without a depth cutoff", proof: "assertion:context.root_fetches_every_ancestor_root_first", sources: [S2, S5, S7, S10] }
  - { id: A4, statement: "project context follows contextProject independently of ancestry", proof: "assertion:context.project_follows_its_own_setting", sources: [S7, S8] }
  - { id: A5, statement: "siblings and descendants never arrive as ancestry under any scope", proof: "assertion:context.siblings_and_descendants_are_not_context", sources: [S2, S12] }
  - { id: A6, statement: "triage, implementation, review triage (the planned reviewTriage), review repair (addressThreads) and self-review see the same attributed project and ancestor context", proof: "assertion:context.the_same_roots_reach_triage_implementation_review_and_self_review", sources: [S1, S3, S4, S6] }
  - { id: A7, statement: "editing the config and remounting changes the next prompt without rewriting a work record", proof: "assertion:context.changing_the_config_rebuilds_the_next_prompt", sources: [S11, S13] }
  - { id: A8, statement: "an unknown ancestry scope or a cyclic parent chain is refused by name instead of being truncated or looped", proof: "test:plugins/linear/tests/LinearTracker.test.ts", sources: [S9, S10, S14] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "context is only read from Linear; no tracker or host write is added" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "the relay only forwards workContext; when an attempt is charged or given back is unchanged" }
  - { mechanism: agent-replies, answer: n/a, why: "only the prompt gains context sections; how a reply is read is unchanged" }
guarantee:
  - { holds: "the relay never drops context handed to a step call", not_against: "a workflow still choosing when, or whether, to call a step" }
  - { holds: "only the Linear plugin reads its context settings; no workflow reads Linear configuration", not_against: "a mounted plugin's settings changing without a remount" }
failures:
  - { step: Linear plugin ready, when: "contextAncestors is not none, parent or root", goes_to: "refused by name before any ticket is asked for" }
  - { step: root ancestry walk, when: "a parent id was already visited", goes_to: "refused, naming the cycle, rather than looping or truncating" }
cut:
  - "pulling a whole board into every prompt: context is an operator choice"
  - "siblings and descendants as context"
  - "an arbitrary depth limit on root"
  - "folding context into body: a missing description stays distinguishable from a parent's explanation"
  - "one prompt format per step: one shared renderer instead"
  - "copying context into the workflow record"
  - "hot reload of the Linear config: edit and remount only"
exit: "with the Linear plugin configured, one leaf ticket carries its project and every parent to all agent steps, self-review included; the same install can turn it down or off, the gate proving prompts change with configuration, not hard-coded policy"
---
# A child carries its roots

A Linear ticket reaches amy as its own title and description only: the project,
parent and root that explain why it exists stay in Linear, and no agent step —
self-review included — sees them.
