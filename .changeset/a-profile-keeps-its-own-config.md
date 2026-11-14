---
"@amykit/cli": minor
---

**A profile keeps its own config.** Each profile may keep a `config.yaml` and a
`.env` of its own under `profiles/<name>/`, and reads the machine's files with
its own over them: mappings merge key by key, a list or a scalar replaces the
machine's value whole, and a profile with no file reads exactly as before.
`workflows:` and `defaultWorkflow` stay in the machine's file, and a profile
file naming either is refused at boot by name. Keys are read in one order —
exported in the shell, the project's `.env`, the profile's, the machine's — and
a loop started for one profile no longer inherits another profile's keys.
`amy doctor` names every config and `.env` file it read, no longer fails a
machine-wide slice another declared profile mounts (it names that profile), and
fails a profile file no declared profile names.
