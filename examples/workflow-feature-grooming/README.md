# feature-grooming

**Turn a feature idea into a clear brief before anybody writes code.**

Most features go wrong before the first line of code: nobody wrote down what
"done" means, or where a requirement came from. Grooming is the conversation
that fixes that, and the **brief** is what it leaves behind.

A brief in amy has four sections:

| Section | What goes in it |
| :-- | :-- |
| **Goal** | Why the feature exists, in a sentence or two. |
| **Sources** | Where each requirement comes from, one per line: `S1: the ticket`, `S2: a decision on 2026-11-06`. |
| **Criteria** | What has to be true when it is done, each one naming its source: `C1: a paid invoice shows "Paid" (source: S1)`. |
| **Out of scope** | What this feature is not going to do. |

This workflow waits until the brief is complete and correct, and then hands
the criteria on. It does not write the brief itself. A person does that,
usually with the `amy-groom` skill in their agent, which reads the ticket and
the code and asks one question at a time.

## How it moves

```text
GROOMING ──> BRIEFED   every section is answered and the brief's check accepts it
```

1. **GROOMING.** amy looks at the brief every few minutes. While a section is
   missing, or a criterion names a source that is not listed, it keeps
   waiting.
2. **BRIEFED.** The brief is done. The workflow returns its criteria, so the
   next phase knows what the work is for and what the proof has to show.

That is why it is so short: it is the first phase of a bigger project. See
[a-whole-project](../a-whole-project), where this is the `brief/` phase,
[ticket-to-qa](../workflow-ticket-to-qa) does the work, and the proof runs
last.

## What it needs

- **A place for briefs**, like `@amykit/plugin-file-brief-store`.

## Try it

```sh
amy add @amykit/workflow-feature-grooming
amy doctor
```

Then, in your agent, groom a feature with `/amy-groom <ticket>`, and check
where it stands with `amy brief`.

`repos` is required: it lists the repositories whose base branch grooming may
read.

<!-- amy:generated reference -->

## Install

```sh
# Add @amykit/workflow-feature-grooming to amy.yaml, then install configured plugins:
amy init --install
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

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/build/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
