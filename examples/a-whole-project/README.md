# A whole project

This example composes shipped workflows into one project that grooms a feature, builds it and proves it works.

A project is the parent folder of a `brief/`, a `workflow/` and a `prove/`
folder. Each folder's `index.ts` is a few lines pointing at a shipped workflow,
and amy derives the project's walk from the folders: BRIEF, WORK, PROVE, DONE.

| Folder | Phase | What happens | Workflow |
| :-- | :-- | :-- | :-- |
| `brief/` | BRIEF | The feature is groomed into a brief whose criteria name their sources. | [feature-grooming](../workflow-feature-grooming) |
| `workflow/` | WORK | A ticket is walked to a QA handoff. | [ticket-to-qa](../workflow-ticket-to-qa) |
| `prove/` | PROVE | The brief's `Scenario` runs against the real system. | `@amykit/plugin-prove` |

Why: [a project is brief, work and proof](../../docs/design/a-project-is-brief-work-and-proof.md).

## Try it

Name any of the folders as a profile's workflow, and amy finds the others
beside it:

```yaml
workflows:
  shop:
    workflow: "~/work/a-whole-project/brief"
```

## What the proof looks like

The brief carries a `Scenario`: the steps that show a criterion holds. Here it
opens a page through `@amykit/plugin-agent-browser` and reads what it shows:

```yaml
name: paid-invoice-shows-paid
steps:
  - { id: open, operation: browser.open, input: { url: "https://shop.localhost/invoices/1" } }
  - { id: read, operation: browser.snapshot, input: { interactive: false } }
assertions:
  - { id: shown, criterion: C1, step: read, path: snapshot }
```

`C1` is a criterion from the brief, so the proof answers the question grooming
settled. [Prove a phase](../../docs/build/prove-a-phase.md) explains the
scenario, the resources it uses and the proof it leaves.
