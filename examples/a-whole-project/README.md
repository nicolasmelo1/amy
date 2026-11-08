# A whole project

Brief, work and proof, each phase a workflow amy ships, so nothing here is
written per task:

| Folder | Phase | Workflow |
| :-- | :-- | :-- |
| `brief/` | BRIEF | `@amykit/workflow-feature-grooming`: Goal, Sources, Criteria, Out of scope, groomed with `amy-groom` |
| `workflow/` | WORK | `@amykit/workflow-ticket-to-qa`: the ticket walked to a QA handoff |
| `prove/` | PROVE | `@amykit/plugin-prove`: the brief's `Scenario`, walked against the real system |

Name any of the folders as the profile's workflow and amy derives the
project's walk — BRIEF, WORK, PROVE, DONE — from the folders:

```yaml
workflows:
  shop:
    workflow: "~/work/a-whole-project/brief"
```

The brief the project is groomed into carries a browser scenario, which the
proving phase walks through `@amykit/plugin-agent-browser`:

```yaml
name: paid-invoice-shows-paid
steps:
  - { id: open, operation: browser.open, input: { url: "https://shop.localhost/invoices/1" } }
  - { id: read, operation: browser.snapshot, input: { interactive: false } }
assertions:
  - { id: shown, criterion: C1, step: read, path: snapshot }
```

See [Prove a phase](../../docs/build/prove-a-phase.md) for the scenario, the
resources it leases and the proof it leaves.
