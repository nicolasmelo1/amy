# A whole project

**One feature, from the idea to the proof that it works, using only workflows
amy already ships.**

The other examples each do one job. This one shows how they fit together. A
project here has three phases, one per folder, and each folder is just a
workflow from this repository:

| Folder | Phase | What happens | Workflow |
| :-- | :-- | :-- | :-- |
| `brief/` | BRIEF | The feature is groomed into a brief: Goal, Sources, Criteria, Out of scope. | [feature-grooming](../workflow-feature-grooming) |
| `workflow/` | WORK | A ticket is walked from "in progress" to a QA handoff. | [ticket-to-qa](../workflow-ticket-to-qa) |
| `prove/` | PROVE | The brief's `Scenario` is run against the real system, to show it really works. | `@amykit/plugin-prove` |

Nothing in these folders is written for one particular task. Each `index.ts`
is a few lines that point at a shipped workflow.

## Try it

Name any of the three folders as a profile's workflow, and amy finds the other
two beside it and walks the project through BRIEF, WORK, PROVE and DONE:

```yaml
workflows:
  shop:
    workflow: "~/work/a-whole-project/brief"
```

## What the proof looks like

The brief carries a `Scenario`: the steps that show a criterion holds. Here it
opens a page in a browser, through `@amykit/plugin-agent-browser`, and reads
what it shows:

```yaml
name: paid-invoice-shows-paid
steps:
  - { id: open, operation: browser.open, input: { url: "https://shop.localhost/invoices/1" } }
  - { id: read, operation: browser.snapshot, input: { interactive: false } }
assertions:
  - { id: shown, criterion: C1, step: read, path: snapshot }
```

`C1` is a criterion from the brief, so the proof answers the exact question the
grooming settled.

→ [Prove a phase](../../docs/build/prove-a-phase.md) explains the scenario, the
resources it uses and the proof it leaves.
