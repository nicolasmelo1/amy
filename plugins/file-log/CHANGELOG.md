# @amykit/plugin-file-log

## 0.7.0

### Minor Changes

- 37504c1: **The event log can be watched, from any process.**
  
  Everything amy does is a line in the event log, and a reader in another
  process — `amy status`, a dashboard, the window planned next — could only read
  it again and guess how often. The log is the one place that knows something
  changed, so it is now the place to ask.
  
  - `EventLog` gains an optional `watch(since, onEvent)`: every event at or
    after `since`, oldest first, then every event any process appends, until the
    returned function is called. Optional because a log may be a sink nobody
    can watch.
  - `watchEvents(log, since, onEvent, { everyMs, onPolling })` in the core
    watches any log: through its own `watch`, or by polling `read` when it has
    none, calling `onPolling` once so the caller can say so.
  - `@amykit/plugin-file-log` implements `watch` by following each day file from
    a byte offset. A line is delivered only once its newline is on disk, so a
    line the daemon is halfway through writing is never read half, and a new
    day's file is followed without resubscribing.

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

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

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

- f9944f6: A workflow is a name in a config, and a plugin is installed rather than
  compiled in.
  
  `--workflow` used to accept two literals, so an install could not drive a
  workflow this repository had not shipped — while the engine underneath it
  could drive anything. A profile is now an entry under `workflows:` in
  `.amy/config.yaml`: a name, the package that drives it, and optionally the
  plugins to mount under it. The two shipped ones are what a config with no
  such block gets.
  
  Each profile keeps its records and queue under `.amy/<name>/`, so a second
  workflow no longer writes over the first's state. **State from an older
  install stays where it was**: `amy doctor` names each directory it found and
  the one `mv` that moves it.
  
  The loader's table of literal imports is gone with the compiled binary. What
  installs is packages, resolved by name at run time, so a machine carries the
  plugins it uses and nothing else — `AMY_PACKAGES` takes the subset. A plugin
  named and not installed is refused at boot with the list of what is, and
  `amy plugin list` reports installed and mounted as the different questions
  they are.
  
  `@amykit/cli` therefore stops depending on ten plugins it never imported, and
  `amy init` prints the `npm install` line for whatever a configured workflow
  needs and this machine does not have.
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
