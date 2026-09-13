# A child carries its roots

A Linear ticket reaches amy as its own title and description only. The query
behind both discovery and lookup asks for the fields in `ISSUE_FIELDS`
(`plugins/linear/src/LinearTracker.ts:16`), and `toTicket` copies those fields
onto `Ticket` (`plugins/linear/src/LinearTracker.ts:257`). A child of a child
therefore arrives indistinguishably from a root ticket: the project that says
why the work exists, the parent that divided it, and the root that set the
boundary are all still in Linear and none reaches the agent.

This is not permission to pull a whole board into every prompt. It is context,
and context is an operator choice. Issue #54 asks for the complete ancestry
when wanted — project, parent, grandparent, continuing until the root — and for
no automatic expansion when it is not wanted. Siblings and descendants are
not ancestors and do not come along for the ride.

The omission currently survives the whole lifecycle. `Ticket` has no place for
context (`packages/workflow-ticket-to-qa/src/ticket.ts:4`), while
`HarnessAgent` independently renders the ticket in triage, implementation and
review (`packages/agent-kit/src/HarnessAgent.ts:51`, `:110`, `:171`). A private
workflow's `self-review` is a generic harness half-step, so fixing only those
three prompts would repeat the defect at the point meant to catch it.

## What changes

**Context is data, not a longer body.** `Ticket` gains an optional
`context: readonly WorkContext[]`, where each item names its kind
(`project` or `ancestor`), stable id, title, URL and optional body. The ticket's
own `body` remains exactly the ticket's description; code can still distinguish
"this ticket has no description" from "its parent explained it". Ancestors are
root-first and end at the immediate parent, so the prompt reads from intent to
leaf without pretending a parent is part of the child's specification.

The neutral `WorkContext` shape lives with the agent/harness contract rather
than with Linear. `AskContext` can carry it for workflow-owned half-steps, and
agent-kit owns one renderer used by both `HarnessAgent` and `HarnessRelay`.
That gives triage, implementation, review triage, review repair and a generic
`self-review` the same attributed sections without five prompt builders
inventing five formats. A workflow still chooses when to call a step; the
relay only guarantees that context handed to that call is not dropped.

**The Linear plugin chooses what to fetch.** Its own config slice gains two
settings:

```yaml
plugins:
  "@amykit/plugin-linear":
    contextProject: true
    contextAncestors: root
```

`contextProject` is boolean and defaults to `false`.
`contextAncestors` is `none`, `parent` or `root` and defaults to `none`.
`parent` fetches exactly the immediate parent; `root` follows every parent
until there is none, with no arbitrary depth limit. The project is the first
project found from the child toward the root, so a child whose project lives
on its parent still receives it once. Defaults preserve today's request count
and prompt exactly: context is not automatic.

`ConfigSchema` can prove boolean and string but not an enum, so the Linear
plugin parses `contextAncestors` in `ready` and refuses any other value before
it asks for a ticket. The plugin passes the parsed settings into
`LinearTracker`; no workflow reads Linear configuration.

**The ancestry is rebuilt from the tracker.** The first issue query returns
the parent id and project fields needed to decide whether another lookup is
required. `root` follows parent ids iteratively, records visited ids, and
refuses a cycle by naming it rather than looping. `inProgress` and `get` use
one context builder, so discovery and later observations cannot disagree.
Nothing is copied into the workflow record: after config is edited and amy is
restarted, the next observation rebuilds the ticket under the new setting
instead of replaying context chosen by the old mount.

**Every agent-facing step gets the same value.** Ticket-shaped calls carry
`ticket.context`; generic calls carry the same array through
`AskContext.workContext`. The relay facade must pass it at both levels. The
shared renderer is exercised for triage, implementation, `addressThreads`,
the planned `reviewTriage`, and the workflow-declared `self-review` half-step.
That last assertion is explicit: a self-review without the ticket's roots is a
review of the patch without the reason the patch exists.

## The gate

`ticket-to-qa`, extended. Its stand-in Linear world contains a project and the
chain `ROOT-1` -> `PARENT-2` -> `CHILD-3`, with a misleading sibling that must
never appear. The fake harness records every prompt, including a self-review
half-step, and the scenario runs the installed machine under more than one
Linear plugin configuration:

- `context.the_default_fetches_no_project_or_ancestor`
- `context.project_follows_its_own_setting`
- `context.parent_fetches_exactly_one_parent`
- `context.root_fetches_every_ancestor_root_first`
- `context.siblings_and_descendants_are_not_context`
- `context.the_same_roots_reach_triage_implementation_review_and_self_review`
- `context.changing_the_config_rebuilds_the_next_prompt`
- `context.an_unknown_ancestry_scope_is_refused_before_work`

The changed-config assertion writes `none`, observes a prompt without roots,
stops the process, writes `root`, and observes the next prompt with both
ancestors. It proves the supported configuration lifecycle — edit and remount
— without claiming hot reload a mounted plugin does not provide.

## Acceptance criteria

- [ ] With the default Linear config, neither project nor ancestry is queried
      or rendered
      (proof: assertion:context.the_default_fetches_no_project_or_ancestor)
- [ ] `contextAncestors: parent` includes the immediate parent and stops there
      (proof: assertion:context.parent_fetches_exactly_one_parent)
- [ ] `contextAncestors: root` includes every ancestor, root first, without a
      depth cutoff
      (proof: assertion:context.root_fetches_every_ancestor_root_first)
- [ ] Project context follows `contextProject` independently of ancestry
      (proof: assertion:context.project_follows_its_own_setting)
- [ ] Siblings and descendants never arrive as ancestry under any scope
      (proof: assertion:context.siblings_and_descendants_are_not_context)
- [ ] Triage, implementation, review triage, review repair and self-review see
      the same attributed project and ancestor context
      (proof: assertion:context.the_same_roots_reach_triage_implementation_review_and_self_review)
- [ ] Editing the config and remounting changes the next prompt without
      rewriting a work record
      (proof: assertion:context.changing_the_config_rebuilds_the_next_prompt)
- [ ] An unknown ancestry scope or a cyclic parent chain is refused by name
      instead of being truncated or looped
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)

**Exit condition:** one leaf ticket can carry its project and every parent to
all agent steps, including self-review, when the Linear plugin is configured
to do so; the same install can turn that context down or off, and the gate
proves the prompts change with the configuration rather than with hard-coded
policy.