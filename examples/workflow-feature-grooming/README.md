# feature-grooming

This workflow waits until a feature's brief is complete and checked, then returns the criteria it settled.

A brief is what grooming leaves behind: what "done" means, and where each
requirement came from. The workflow declares the sections its brief answers
(Goal, Sources, Criteria, Out of scope), and its check holds each line to a
shape: a source is `S1: the ticket`, a criterion is `C1: a paid invoice shows
"Paid" (source: S1)` and must cite a listed source.

It does not write the brief. A person does, usually with the `amy-groom` skill,
which reads the ticket and the code and asks one question at a time. Why: [a
brief is groomed from its sources](../../docs/design/a-brief-is-groomed-from-its-sources.md)
and [grooming reads the sections its workflow declares](../../docs/design/grooming-reads-the-sections-its-workflow-declares.md).

## How it moves

```text
GROOMING ──> BRIEFED   every section is answered and the brief's check accepts it
```

1. **GROOMING.** amy looks at the brief every few minutes and waits while a
   section is blank or the check refuses a line.
2. **BRIEFED.** The workflow returns the criteria, so the next phase knows
   what the work is for and what the proof has to show.

It registers no port of its own, so another workflow can call it. In
[a-whole-project](../a-whole-project) it is the `brief/` phase. Why: [a
workflow calls another](../../docs/design/a-workflow-calls-another.md).

## Try it

```sh
amy add @amykit/workflow-feature-grooming
amy doctor
```

It needs a place for briefs, like `@amykit/plugin-file-brief-store`, and
`repos`, the repositories whose base branch grooming may read. Groom a
feature with `/amy-groom <ticket>` in your agent, and check where it stands
with `amy brief`.

<!-- amy:generated reference -->

## Install

```sh
amy add @amykit/workflow-feature-grooming
```

Then name it in `~/.amy/config.yaml`:

```yaml
workflows:
  feature-grooming:
    workflow: "@amykit/workflow-feature-grooming"
```

## The lifecycle

| State | Kind |
| :-- | :-- |
| `GROOMING` | initial, waiting |
| `BRIEFED` | terminal |

## Configuration

```yaml
plugins:
  "@amykit/workflow-feature-grooming":
    baseBranch: {}
    defaultBranch: "main"
    policy:
      briefLookMs: 300000
    repos: <string[]>
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `baseBranch` | `record` | no | `{}` | where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, for a repository that named none, which is not always `main` |
| `policy.briefLookMs` | `number` | no | `300000` | how often a brief still being groomed is looked at again |
| `repos` | `string[]` | **yes** |  | repositories whose configured base branch grooming may read |

Every field is checked at boot against the schema this package declares. A key that is
not one of the above is a refusal naming the plugin and the key, not a setting that
silently never applied.

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/guides/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
