---
"@amykit/cli": minor
"@amykit/core": minor
"@amykit/workflow-ticket-to-qa": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/plugin-file-worktree": minor
"@amykit/plugin-agent-relay": minor
---

**A plugin brings operations, not commands.** `PluginCommand` is removed: a
plugin declares `operations` — each one `defineOperation`, with its input and
output schemas — and the command line is drawn from them like every other
door. Installing a plugin adds its command, its entry in `amy contract` and the
id an action can call; removing it takes all three. A plugin that still
declares `commands` is refused at load, naming the plugin and the member.

- Each operation with `cli` words is a command, marked with its package in
  `amy --help`. Its positional fields are arguments, every other field a flag;
  a number is parsed, a boolean is a bare flag, an array repeats, an enum lists
  its values, and a value that does not parse is refused naming the flag.
- `--json` prints the output as JSON, a stream as JSON Lines and an error as
  the `{ code, message, details? }` envelope on stderr. Without it the output
  is drawn from itself and its schema: objects as labelled fields, arrays of
  objects as tables, enums coloured. No operation draws its own output.
- The exit code is the outcome: 0 an output, 1 a declared error, 2 an input
  refused, 70 anything undeclared or a machine that would not mount.
- `amy contract` prints the install's whole contract — amy's services and every
  mounted plugin's operations — as an OpenAPI document; `amy contract --check`
  refuses one that does not build. A plugin's operation is local-only unless it
  says `localOnly: false`.
- An operation id and a command's first word each belong to one package; a
  second claiming either is refused at load, naming both.
- A workflow's action calls a mounted plugin's operation by id with
  `operate(id, input)`, getting the output or the error, and reaches only what
  its profile mounts.
- `amy btw`, `amy note`, `amy roster`, `amy worktrees` and `amy models` keep
  their words and are now operations. Their output is drawn rather than
  written by hand, and each takes `--json`.
