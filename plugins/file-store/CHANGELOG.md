# @amykit/plugin-file-store

## 0.9.1

### Patch Changes

- Updated dependencies [579483d]
- Updated dependencies [579483d]
  - @amykit/core@0.9.1
  - @amykit/plugin-file-brief-store@0.9.1

## 0.9.0

### Patch Changes

- f4282ca: **Nothing a process writes is lost to another, and no call waits forever.**
  
  `amy run` now discovers before it ticks, through the same pass `amy tick` and the
  daemon use, so a ticket sitting in the world is picked up on the first pass. One
  transport in core gives every request a deadline and counts the body as it
  arrives; Slack, Linear, Telegram and the models.dev refresh go through it. One
  atomic write stages under a name only its writer holds, and notes, tasks and
  records use it: two writers at one instant both survive, and `amy look` changes
  a record under its own lock instead of overwriting the engine's move. The
  Telegram bot takes core's lock, so a stale one is buried through a tombstone
  rather than renamed aside by two processes at once. `config explain`, `workflow
  check` and `workflow export` build their resolver with the profile they act for,
  so a fork is what they read. Three repo-local rules keep each class out: a bare
  `fetch`, a hand-built `.tmp` name and a resolver without its profile.
- Updated dependencies [e7a5a2e]
- Updated dependencies [a169c23]
- Updated dependencies [96edd4a]
- Updated dependencies [fde989b]
- Updated dependencies [1198a21]
- Updated dependencies [1232657]
- Updated dependencies [f4282ca]
- Updated dependencies [fde989b]
  - @amykit/core@0.9.0
  - @amykit/plugin-file-brief-store@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [a41a17f]
- Updated dependencies [9a9ac0a]
- Updated dependencies [3a8cc7a]
  - @amykit/core@0.8.0
  - @amykit/plugin-file-brief-store@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1
  - @amykit/plugin-file-brief-store@0.7.1

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.

### Patch Changes

- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
- Updated dependencies [b761f29]
- Updated dependencies [3b540fa]
- Updated dependencies [cea9b94]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [4a55287]
- Updated dependencies [91f6caf]
- Updated dependencies [ac4faca]
- Updated dependencies [ebae48c]
- Updated dependencies [2b4deec]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [65ebf9f]
- Updated dependencies [8b21570]
- Updated dependencies [d85dacd]
- Updated dependencies [c7cd07a]
- Updated dependencies [bb67d1f]
- Updated dependencies [ec32d67]
- Updated dependencies [b266baf]
- Updated dependencies [f062bea]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/plugin-file-brief-store@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0
  - @amykit/plugin-file-brief-store@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [d490ceb]
- Updated dependencies [b8c781a]
- Updated dependencies [c1edd17]
- Updated dependencies [5ff03ad]
- Updated dependencies [3a993e1]
- Updated dependencies [f259468]
- Updated dependencies [75e1f57]
- Updated dependencies [8b2fcc8]
- Updated dependencies [9bb3d24]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0
  - @amykit/plugin-file-brief-store@0.5.0

## 0.4.0

### Patch Changes

- 2dc9117: A brief reaches every ticket it explains.
  
  Tickets may inherit a shared brief from their Linear parent. The workflow reads
  that brief freshly on every observation, carries it to triage, implementation,
  review and its self-review half-step, records questions against it, and keeps a
  brief only while its explained work remains non-terminal or inside retention.
  `amy brief <id>` renders the mounted brief without exposing its store path.
- Updated dependencies [c7a36eb]
- Updated dependencies [2dc9117]
- Updated dependencies [b3b7a07]
- Updated dependencies [0ca2c1c]
- Updated dependencies [c30789e]
- Updated dependencies [fc6748a]
- Updated dependencies [5b37451]
- Updated dependencies [bfda1ac]
- Updated dependencies [f1557f6]
  - @amykit/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/core@0.2.0
