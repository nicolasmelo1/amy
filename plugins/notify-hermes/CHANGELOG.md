# @amykit/plugin-notify-hermes

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.

### Patch Changes

- Updated dependencies [b761f29]
- Updated dependencies [2c7324c]
- Updated dependencies [ebae48c]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [3649573]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/plugin-notify-fanout@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0
  - @amykit/plugin-notify-fanout@0.6.0

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
  - @amykit/plugin-notify-fanout@0.5.0

## 0.4.0

### Patch Changes

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
  - @amykit/plugin-notify-fanout@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/plugin-notify-fanout@0.3.1

## 0.3.0

### Minor Changes

- 7ec6c02: Nothing is installed by default: the command arrives alone, the first workflow is the one the person there names or writes.
  
  `@amykit/cli` depends on no workflow and no notifier. The roster the ticket workflow reads is contributed by the host under the name the workflow looks up — spelled where the file is read, not imported — and whether a Hermes target is reachable is asked of the `notify` port the mounted channel contributes.
  
  `SHIPPED_PROFILES` is empty: a config with no `workflows:` block drives nothing, and every command that needs one says so and names `amy workflow new` and `amy add`. `EXAMPLE_CONFIG` keeps the two published workflows as commented examples, its plugin slices commented with them, and `amy init` writes its files and installs nothing. A machine with nothing mounted is still diagnosed: `amy doctor` reports everything it can see and names the missing workflow in the selection's own words.
  
  New gate `bare-install`: the scenario installs the command alone onto a machine with none of it and proves what it can and cannot do — twelve assertions, from "the command arrives alone" to "doctor asks the port, not the package".

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0
  - @amykit/plugin-notify-fanout@0.3.0

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
  - @amykit/plugin-notify-fanout@0.2.0
