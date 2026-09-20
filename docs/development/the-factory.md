---
title: The factory itself
description: The tool the gate is made of, printed by the version this repository pins.
group: Development
order: 5
---

# The factory itself

[The gate](the-gate.md) is what this repository enforces. This page is the
**tool that enforces it** — `sf`, at the version
[`catalog.lock.json`](https://github.com/nicolasmelo1/amy/tree/main/.software-factory/catalog.lock.json)
names, printed by that binary rather than written down beside it.

It is here for the same reason everything in
[Reference](../reference/cli.md) is generated: a version pinned in three files
and described in prose is a description that goes stale on the bump nobody
re-read. `sf docs` writes every block below, `npm run gate` runs it, and the
build goes red when this page and the installed tool disagree.

Everything on this page is regenerated. Edit the prose around a block, never
the block.

## The commands

<!-- sf:generated cli-index -->
| Command | What it does |
| :-- | :-- |
| [`sf catalog`](#sf-catalog) | List the catalog |
| [`sf check`](#sf-check) | Run every enabled rule |
| [`sf docs`](#sf-docs) | Regenerate documentation. Add --check to make this read-only |
| [`sf explain`](#sf-explain) | Print a rule: what it requires, why it exists, how to fix a violation |
| [`sf fixtures`](#sf-fixtures) | Write the mutation fixtures for every enabled rule |
| [`sf init`](#sf-init) | Scaffold policy, docs, CI, hooks and mutation fixtures into a repository |
| [`sf interview`](#sf-interview) | Print the decision tree an interview walks, and what each answer does |
| [`sf lock`](#sf-lock) | Rewrite the hash locks from what is on disk |
| [`sf ratchet`](#sf-ratchet) | Freeze today's violations so a repository can adopt rules it breaks |
| [`sf seal`](#sf-seal) | Recompute the digests in a gate's evidence manifest |
| [`sf skills`](#sf-skills) | Install the agent skills that drive this tool |
| [`sf verify`](#sf-verify) | Prove every enabled rule fires on its mutation fixture |

<!-- sf:end cli-index -->

Every command takes these:

<!-- sf:generated cli-global -->
| Option | What it does |
| :-- | :-- |
| `--root <ROOT>` | Repository to operate on. |

<!-- sf:end cli-global -->

### In detail

<!-- sf:generated cli-detail -->
### `sf catalog`

List the catalog

```sh
sf catalog [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--layer <LAYER>` | List one layer only, by its identifier: L0 through L6 | none |

### `sf check`

Run every enabled rule

```sh
sf check [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--format <FORMAT>` | How to print the report: text for a person, json for a machine, markdown for a pull request comment | `text` |
| `--changed <CHANGED>` | Git ref to diff against, so gates activate from touched paths and the policy can be compared with the one being replaced | none |
| `--rule <RULE>` | Run one rule only | none |
| `--allow-commands` | Let `command` rules actually run. | off |
| `--policy <POLICY>` | Govern this run with a policy that lives somewhere else: a directory carrying `policy.yaml` and optional `rules/`, read read-only over a repository carrying none of its own. | none |

### `sf docs`

Regenerate documentation. Add --check to make this read-only

```sh
sf docs [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--check` | Write nothing. | off |

### `sf explain`

Print a rule: what it requires, why it exists, how to fix a violation

```sh
sf explain <RULE>
```

No flags of its own; the global options above apply.

### `sf fixtures`

Write the mutation fixtures for every enabled rule

```sh
sf fixtures
```

No flags of its own; the global options above apply.

### `sf init`

Scaffold policy, docs, CI, hooks and mutation fixtures into a repository

```sh
sf init [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--name <NAME>` | Project name recorded in the policy | none |
| `--language <LANGUAGE>` | Languages to parse: python, typescript, go, rust, ruby | `python`, `typescript`, `go` |
| `--layer <LAYER>` | Layers to enable. | `L1`, `L4`, `L5` |
| `--force` | Overwrite an existing policy | off |
| `--rules-document <RULES_DOCUMENT>` | Where to write the rule reference. | none |
| `--answers <ANSWERS>` | Answers from a `factory-init` interview. | none |

### `sf interview`

Print the decision tree an interview walks, and what each answer does

```sh
sf interview [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--json` | Machine-readable, for an agent conducting the interview | off |

### `sf lock`

Rewrite the hash locks from what is on disk

```sh
sf lock
```

No flags of its own; the global options above apply.

### `sf ratchet`

Freeze today's violations so a repository can adopt rules it breaks

```sh
sf ratchet [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--months <MONTHS>` | Months until the frozen entries must be reviewed | `6` |

### `sf seal`

Recompute the digests in a gate's evidence manifest

```sh
sf seal <GATE>
```

No flags of its own; the global options above apply.

### `sf skills`

Install the agent skills that drive this tool

```sh
sf skills [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--dir <DIR>` | Where to write them. | none |
| `--project` | This repository only: `<root>/.claude/skills` | off |
| `--user` | Every project on this machine: `~/.claude/skills` | off |

### `sf verify`

Prove every enabled rule fires on its mutation fixture

```sh
sf verify [options]
```

| Flag | What it does | Default |
| :-- | :-- | :-- |
| `--rule <RULE>` | Prove one rule only | none |
| `--allow-commands` | Let `command` rules actually run, so a command rule can be proven to fire rather than reported as unproven | off |
<!-- sf:end cli-detail -->

## The skills that drive it

These are the four skills `sf skills` installs. `/factory-triage` is the one to
reach for when a build is red and the finding is not obvious.

<!-- sf:generated skills-index -->
| Skill | What it is for |
| :-- | :-- |
| `/factory-init` | Interview someone about their project's architecture and stack, then generate the software-factory rules those answers imply. |
| `/factory-author` | Turn a requirement into machine-checkable policy for the software factory — gates, activation paths, required assertions, and new catalog rules. |
| `/factory-evidence` | Create or run the proof behind a software-factory L3 gate and seal evidence that survives re-verification. |
| `/factory-triage` | Read a software-factory report, explain what actually broke, and fix it. |

<!-- sf:end skills-index -->

## What it can parse

A rule can only see a language it has a grammar for. A file in a language that
is not below is a file no L0 or L1 rule reads, which is worth knowing before
trusting a green run over a mixed tree.

<!-- sf:generated language-coverage -->
| Rule | Languages with a query |
| :-- | :-- |
| `L0.EXCEPTIONS_HAVE_ONE_HOME` | go, python, ruby, rust, typescript |
| `L0.NO_CROSS_LAYER_IMPORT` | go, python, ruby, rust, typescript |
| `L0.ONE_ENTRYPOINT_PER_FILE` | go, python, typescript |
| `L0.PERSISTENCE_STAYS_IN_REPOSITORIES` | go, python, typescript |
| `L1.INDIRECTION_EARNS_ITS_NAME` | python, rust, typescript |
| `L1.SKIPPED_TESTS_STATE_A_REASON` | go, python, ruby, rust, typescript |
| `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK` | go, python, ruby, rust |
| `L6.ONE_LOCK_AT_A_TIME` | go, python, ruby, rust |

<!-- sf:end language-coverage -->

<!-- sf:generated language-grammars -->
| Grammar | Files it reads |
| :-- | :-- |
| python | `*.py`, `*.pyi` |
| typescript | `*.ts`, `*.mts`, `*.cts` |
| typescript | `*.tsx` |
| go | `*.go` |
| rust | `*.rs` |
| ruby | `*.rb`, `*.rake`, `*.gemspec`, `*.ru` |

<!-- sf:end language-grammars -->

## The hazard tools

L6 rules do not read the code themselves — each one names a tool it expects to
find and reports it as unrunnable when it is missing.

<!-- sf:generated hazard-tools -->
| Concern | go | python | ruby | rust | typescript |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Concurrent code is exercised under a race detector | -race, go test -race | no tool listed | no tool listed | thread-sanitizer, -Zsanitizer=thread, loom | no tool listed |
| Something detects code nothing reaches | staticcheck, deadcode, unused | vulture, deadcode | no tool listed | cargo udeps, cargo-udeps, dead_code | ts-prune, knip, depcheck |
| Something audits dependencies for known vulnerabilities | govulncheck, osv-scanner, nancy, snyk | pip-audit, osv-scanner, safety, snyk | bundler-audit, bundle-audit, osv-scanner | cargo audit, cargo-audit, cargo-deny, osv-scanner | npm audit, pnpm audit, yarn audit, osv-scanner, snyk |
| Something scans the code for known-insecure patterns | gosec, semgrep, staticcheck, codeql | bandit, semgrep, codeql | brakeman, semgrep, codeql | cargo-geiger, cargo clippy, clippy, semgrep | semgrep, eslint-plugin-security, codeql |
| Something would notice the code getting slower | go test -bench, benchstat, -bench | pytest-benchmark, asv, richbench | no tool listed | criterion, cargo bench, divan | vitest bench, benchmark.js, tinybench, hyperfine |
| Something scans for committed secrets | detect-secrets, gitleaks, trufflehog | detect-secrets, gitleaks, trufflehog | detect-secrets, gitleaks, trufflehog | detect-secrets, gitleaks, trufflehog | detect-secrets, gitleaks, trufflehog |
| Something scans the CI workflows themselves | zizmor, poutine, octoscan | zizmor, poutine, octoscan | zizmor, poutine, octoscan | zizmor, poutine, octoscan | zizmor, poutine, octoscan |

<!-- sf:end hazard-tools -->

## The templates it scaffolds from

<!-- sf:generated templates-index -->
| Template | Rule it writes | What that rule requires | Filled in with |
| :-- | :-- | :-- | :-- |
| `schemas-live-with-their-handler` | `L0.SCHEMAS_LIVE_WITH_THEIR_HANDLER` | Request and response schemas are defined beside the handler that uses them | nothing; it ships as written |
| `no-fetch-inside-an-effect` | `L1.NO_FETCH_INSIDE_AN_EFFECT` | Data fetching does not happen inside an effect | nothing; it ships as written |
| `global-state-lives-in-one-place` | `L0.GLOBAL_STATE_LIVES_IN_ONE_PLACE` | Global stores are created in one directory | nothing; it ships as written |
| `client-never-imports-the-data-layer` | `L0.CLIENT_NEVER_IMPORTS_THE_DATA_LAYER` | Client code never imports the data layer directly | `client_root_first`, `client_root_globs`, `data_layer_packages`, `data_layer_packages_first`, `data_layer_packages_pattern` |

<!-- sf:end templates-index -->

## The interview

`sf init --answers` takes what `/factory-init` collected. This is the tree that
interview walks, and what each answer switches on — the argument behind the
policy this repository already has.

<!-- sf:generated interview-tree -->
### `kind` — What is this repository?

It decides which rule families can mean anything here. Half the catalog is
about an HTTP surface that a CLI does not have.

| Answer | What it does to the policy |
| :-- | :-- |
| `backend-service` | Nothing on its own. |
| `web-client` | switches off `L0.ONE_ENTRYPOINT_PER_FILE`, `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK`, `L6.ONE_LOCK_AT_A_TIME`, `L6.DATA_RACES_ARE_DETECTED`. |
| `mobile-client` | switches off `L0.ONE_ENTRYPOINT_PER_FILE`, `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK`, `L6.ONE_LOCK_AT_A_TIME`, `L6.DATA_RACES_ARE_DETECTED`. |
| `cli` | switches off `L0.ONE_ENTRYPOINT_PER_FILE`. |
| `library` | switches off `L0.ONE_ENTRYPOINT_PER_FILE`. |

### `architecture` — How is the code organised, or how do you intend to organise it?

This is the single answer that produces the most rules, because every layered
architecture is a claim about which code may call which — and that claim is
exactly what erodes first under agent-heavy work.

Asked only when `kind` is backend-service or cli or library.

| Answer | What it does to the policy |
| :-- | :-- |
| `layered` | enables `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L0.ONE_ENTRYPOINT_PER_FILE`, `L0.EXCEPTIONS_HAVE_ONE_HOME`; sets options on `L0.ONE_ENTRYPOINT_PER_FILE`, `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |
| `ddd` | enables `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L0.EXCEPTIONS_HAVE_ONE_HOME`, `L0.NO_CROSS_LAYER_IMPORT`; sets options on `L0.EXCEPTIONS_HAVE_ONE_HOME`, `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |
| `hexagonal` | enables `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L0.NO_CROSS_LAYER_IMPORT`, `L0.EXCEPTIONS_HAVE_ONE_HOME`; sets options on `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |
| `modular-monolith` | enables `L0.EXCEPTIONS_HAVE_ONE_HOME`, `L0.ONE_ENTRYPOINT_PER_FILE`; sets options on `L0.ONE_ENTRYPOINT_PER_FILE`. |
| `none-yet` | switches off `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`, `L0.ONE_ENTRYPOINT_PER_FILE`, `L0.NO_CROSS_LAYER_IMPORT`. |

### `framework` — Which HTTP framework?

It decides what a route declaration looks like, which is what the
one-entrypoint-per-file rule has to recognise.

Asked only when `kind` is backend-service.

| Answer | What it does to the policy |
| :-- | :-- |
| `fastapi` | Nothing on its own. |
| `django` | sets options on `L0.ONE_ENTRYPOINT_PER_FILE`. |
| `flask` | Nothing on its own. |
| `express` | Nothing on its own. |
| `nest` | sets options on `L0.ONE_ENTRYPOINT_PER_FILE`. |
| `hono` | Nothing on its own. |
| `gin` | Nothing on its own. |
| `other` | Nothing on its own. |

### `data_access` — How does code reach the database?

Reaching for the session directly is always the shortest diff, so this is the
boundary agents erode fastest. It is also the one whose loss is most expensive
to recover.

Asked only when `kind` is backend-service.

| Answer | What it does to the policy |
| :-- | :-- |
| `repositories` | enables `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |
| `orm-in-services` | sets options on `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |
| `no-database` | switches off `L0.PERSISTENCE_STAYS_IN_REPOSITORIES`. |

### `errors_home` — Where do error types get defined?

So that "what can this fail with?" is one file read rather than a search
across services, repositories and handlers.

| Answer | What it does to the policy |
| :-- | :-- |
| `per-module` | enables `L0.EXCEPTIONS_HAVE_ONE_HOME`. |
| `single-shared` | enables `L0.EXCEPTIONS_HAVE_ONE_HOME`; sets options on `L0.EXCEPTIONS_HAVE_ONE_HOME`. |
| `no-convention` | switches off `L0.EXCEPTIONS_HAVE_ONE_HOME`. |

### `validation` — What validates data crossing the boundary?

A schema is the only place a boundary is actually described. Where the schemas
live decides whether that description is findable.

| Answer | What it does to the policy |
| :-- | :-- |
| `pydantic` | Nothing on its own. |
| `zod` | Nothing on its own. |
| `go-playground` | Nothing on its own. |
| `none` | Nothing on its own. |

### `validation_placement` — Where do request and response schemas live?

Schemas dumped in a shared types module stop being about any one endpoint, and
the boundary they described becomes unfindable from the handler that owns it.

Asked only when `validation` is pydantic or zod or go-playground.

| Answer | What it does to the policy |
| :-- | :-- |
| `with-the-handler` | writes the template `schemas-live-with-their-handler`. |
| `central-module` | Nothing on its own. |
| `no-convention` | Nothing on its own. |

### `client_data` — How does the client fetch server data?

Fetching inside an effect is the pattern that produces the race conditions,
duplicate requests and stale reads a query cache exists to prevent — and it
is what an agent writes when nothing says otherwise.

Asked only when `kind` is web-client or mobile-client.

| Answer | What it does to the policy |
| :-- | :-- |
| `react-query` | writes the template `no-fetch-inside-an-effect`. |
| `server-components` | writes the template `no-fetch-inside-an-effect`. |
| `manual` | Nothing on its own. |

### `client_state` — Where does global client state live?

A store created inline in a component is invisible to everyone else and
duplicates on re-render. One directory makes the whole of global state
answerable by listing it.

Asked only when `kind` is web-client or mobile-client.

| Answer | What it does to the policy |
| :-- | :-- |
| `single-directory` | writes the template `global-state-lives-in-one-place`. |
| `context-only` | Nothing on its own. |
| `no-convention` | Nothing on its own. |

### `client_root` — Where does the client application live?

The boundary rules need to know which directory is the client half, and a
wrong answer makes them either silent or unbearable.

Asked only when `kind` is web-client or mobile-client.

Free text. Nothing on its own.

### `data_layer_packages` — Which packages must the client never import directly?

In a monorepo the first import of a database client into a component is not a
compile error. It builds, it works in dev, and it either ships credentials
into a browser bundle or drags a driver into the build.

Asked only when `kind` is web-client or mobile-client.

Free text. writes the template `client-never-imports-the-data-layer`.

### `concurrency` — Does this code share mutable state across threads or tasks?

No checker decides whether a program deadlocks. The lock-shape rules and the
race detector are the decidable parts, and they are noise in code that has no
concurrency at all.

Asked only when `kind` is backend-service or cli or library.

| Answer | What it does to the policy |
| :-- | :-- |
| `shared-state` | enables `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK`, `L6.ONE_LOCK_AT_A_TIME`, `L6.DATA_RACES_ARE_DETECTED`. |
| `message-passing` | enables `L6.DATA_RACES_ARE_DETECTED`; switches off `L6.ONE_LOCK_AT_A_TIME`. |
| `single-threaded` | switches off `L6.NO_BLOCKING_CALL_WHILE_HOLDING_A_LOCK`, `L6.ONE_LOCK_AT_A_TIME`, `L6.DATA_RACES_ARE_DETECTED`. |

### `generated` — Which files are generated, vendored or otherwise not hand-written?

Editing a generated file by hand is the smallest possible fix and it silently
forks the artifact from its source. The lock makes that impossible rather than
discouraged.

Free text. enables `L2.GENERATED_FILES_ARE_LOCKED`; points at your own paths `L2.GENERATED_FILES_ARE_LOCKED`.
<!-- sf:end interview-tree -->
