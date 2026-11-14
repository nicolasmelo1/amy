---
base: 11bef4d29aa1f0e8107ee50aa678732b19ad8169
sources:
  - { id: S1, kind: friction, said: "2026-11-13: two profiles on one machine; doctor for the first fails five slices only the second mounts (http, slack, linear, command-gate, agent-browser), doctor for the second fails the two only the first mounts, and both loops run" }
  - { id: S2, kind: code, ref: "packages/cli/src/doctor.ts", symbol: "pluginSettings", said: "every entry of the one plugins: block is checked against the schemas this profile mounted; a slice nothing in this profile declares is FAIL, nothing mounted declares these settings" }
  - { id: S3, kind: code, ref: "packages/core/src/mount.ts", said: "the boot validates only the slices of the plugins it mounts, so the doctor refuses what the loop accepts" }
  - { id: S4, kind: code, ref: "packages/cli/src/config.ts", symbol: "loadConfig", said: "one file, <home>/config.yaml, read the same for every profile; a profile's own words are only its workflows: entry, and a hand-written plugins: slice wins over them (slices.ts mergeInGivenSlices)" }
  - { id: S5, kind: code, ref: "packages/cli/src/index.ts", symbol: "loadEnv", said: "the state directory's .env loads first, then the directory typed in, then AMY_PROJECT_ENV; loadEnv sets only a key still unset, so the machine's file beats the project's, the opposite of the comment above it and of docs/start/installation.md" }
  - { id: S6, kind: code, ref: "packages/cli/src/paths.ts", symbol: "profileForks", said: "<home>/profiles/<name>/ already belongs to one profile: its forks and its daemon.pid live there" }
  - { id: S7, kind: decision, said: "a general config.yaml and one config.yaml per profile, at <home>/profiles/<name>/config.yaml; the profile's file overrides the general one, so no profile's settings clash with another's. Decided 2026-11-13" }
  - { id: S8, kind: decision, said: "a general .env and one .env per profile, at <home>/profiles/<name>/.env; the profile's overrides the general, and no profile's key reaches another's process. Decided 2026-11-13" }
  - { id: S9, kind: decision, said: "the override is a deep merge: a mapping merges key by key, any other value (a list, a scalar, null) replaces the general one whole. Proposed 2026-11-13" }
  - { id: S10, kind: decision, said: "workflows: and defaultWorkflow are the machine's list of profiles and stay in the general file; a profile file that names either is refused by name. Proposed 2026-11-13" }
  - { id: S11, kind: decision, said: "doctor fails a general slice only when no declared profile mounts its plugin, and checks it against the schema only where it is mounted; a profile-file slice the profile does not mount fails. Proposed 2026-11-13" }
  - { id: S12, kind: decision, said: "env precedence, first wins: exported in the shell, the project's .env (the directory typed in, or AMY_PROJECT_ENV), the profile's .env, the general .env. Proposed 2026-11-13" }
touches:
  - packages/cli/src/config.ts
  - packages/cli/src/env.ts
  - packages/cli/src/paths.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - registry/cli.json
  - packages/cli/tests/config.test.ts
  - packages/cli/tests/config-layers.property.test.ts
  - packages/cli/tests/env.test.ts
  - packages/cli/tests/env.property.test.ts
  - packages/cli/tests/doctor.test.ts
  - docs/start/configuration.md
  - docs/start/installation.md
  - docs/start/quickstart.md
  - docs/start/workflows-and-profiles.md
  - docs/start/status-and-doctor.md
untouched:
  - packages/cli/src/slices.ts
criteria:
  - { id: A1, statement: "a profile's config is the general file with <home>/profiles/<name>/config.yaml over it; with no profile file it reads exactly as today", proof: "test:packages/cli/tests/config.test.ts", sources: [S4, S6, S7], done: true }
  - { id: A2, statement: "for any general and profile mapping, every path the profile file sets reads the profile's value, every other path reads the general one, and a list or scalar the profile sets replaces the general one whole", proof: "property:packages/cli/tests/config-layers.property.test.ts#a_nested_key_is_dropped", sources: [S7, S9], done: true }
  - { id: A3, statement: "a profile file that names workflows or defaultWorkflow is refused at boot naming the file and the key", proof: "test:packages/cli/tests/config.test.ts", sources: [S10], done: true }
  - { id: A4, statement: "one profile's file never changes what another profile reads: a slice written in one profile's file is absent from the other's config", proof: "test:packages/cli/tests/config.test.ts", sources: [S7], done: true }
  - { id: A5, statement: "for any key set in any of the four places, the value a process sees is the first of exported, project .env, profile .env, general .env that has it", proof: "property:packages/cli/tests/env.property.test.ts#the_general_env_wins", sources: [S5, S8, S12], done: true }
  - { id: A6, statement: "a key only in one profile's .env is unset in a process started for another profile, supervised or typed", proof: "test:packages/cli/tests/env.test.ts", sources: [S6, S8], done: true }
  - { id: A7, statement: "doctor does not fail a general slice whose plugin another declared profile mounts, and says which profile mounts it; it fails one no profile mounts, and one in the profile's own file the profile does not mount", proof: "test:packages/cli/tests/doctor.test.ts", sources: [S1, S2, S3, S11], done: true }
  - { id: A8, statement: "doctor names every config file and .env file it read for the profile, never a value from them", proof: "test:packages/cli/tests/doctor.test.ts", sources: [S7, S8], done: true }
  - { id: A9, statement: "doctor fails a profile file whose profile the general file does not declare, naming the file", proof: "test:packages/cli/tests/doctor.test.ts", sources: [S6, S10], done: true }
crosses:
  - { mechanism: config, answer: works, proof: "A1, A2, A3" }
  - { mechanism: profiles-and-state, answer: works, proof: "A4, A6" }
  - { mechanism: record-migration, answer: n/a, why: "no record changes shape; only where settings and keys are read from" }
guarantee:
  - { holds: "a setting or key one profile's own files hold never reaches another profile", not_against: "a key exported in the shell that starts both, or a setting left in the general file" }
  - { holds: "doctor fails a plugin slice only when nothing declared would mount it, or its plugin's schema refuses it", not_against: "a slice for a plugin a profile names in its list and never uses" }
failures:
  - { step: reading a profile's config, when: "its YAML does not parse", goes_to: "refused at boot naming the file and the line, as the general file is" }
  - { step: reading a profile's config, when: "it names workflows or defaultWorkflow", goes_to: "refused at boot naming the file and the key (A3)" }
  - { step: reading a profile's .env, when: "a line has no valid key", goes_to: "skipped, as parseEnv skips it in the general file" }
  - { step: doctor, when: "a profile file exists for a profile nobody declares", goes_to: "FAIL naming the file (A9)" }
cut:
  - "the window's Settings editing the general file or the chosen workflow's own: the-workflows-are-seen-everywhere, which edits whichever the breadcrumb chose"
  - "setup and amy add writing into a profile's file: they write the general file as today; moving a slice is an edit by hand"
  - "moving the slices already in the general file into each profile's: an edit to one install, not code"
  - "a profile file of a phase: a project's phases share their profile's file"
exit: "with each of two profiles' slices in its own profiles/<name>/config.yaml and its token in its own .env, doctor is green for both profiles and neither process sees the other's keys"
---
# A profile keeps its own config

Every profile used to read one `config.yaml` and one `.env`: profiles with
different plugins made each other's doctor red, and every key reached every
profile's process. Now `profiles/<name>/config.yaml` and `.env` lie over the
machine's file: mappings merge, lists and scalars replace, `workflows:` stays
the machine's, and doctor names the files it read and refuses a profile file
nobody declares.
