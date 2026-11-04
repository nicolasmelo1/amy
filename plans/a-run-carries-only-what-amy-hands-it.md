---
base: a308896ee2b715d2a30c372806cdb5e53c62ab01
sources:
  - { id: S1, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", said: "claude -p runs with the operator's user settings: their hooks, plugins, ~/.claude/CLAUDE.md, every skill in ~/.claude/skills, and auto-memory writing under ~/.claude/projects/<cwd>/memory" }
  - { id: S2, kind: code, ref: "plugins/codex/src/CodexHarness.ts", said: "codex exec runs with ~/.codex/config.toml, its plugins and apps (MCP servers such as github and gmail), its hooks.json, and persists the session" }
  - { id: S3, kind: code, ref: "plugins/hermes-agent/src/HermesHarness.ts", said: "hermes -z runs in the operator's own ~/.hermes: same memory, same skills, write_approval off for both, curator on; -z bypasses approvals" }
  - { id: S4, kind: decision, said: "a Claude run sees only the skills its step asks for: the relay hands the skill's directory and the harness lends just that one through --add-dir" }
  - { id: S5, kind: decision, said: "amy init creates the Hermes profile amy runs in (hermes profile create --clone), and turns memory off, skill writes to approval and the curator off in it" }
  - { id: S6, kind: code, ref: "packages/core/src/ports/Harness.ts", said: "AskContext is what a caller knows that a relay might need; every field is optional and a single-harness install ignores it" }
touches:
  - packages/core/src/ports/Harness.ts
  - packages/core/src/plugin.ts
  - packages/core/src/commands.ts
  - packages/core/src/index.ts
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/agent-kit/tests/HarnessRelay.test.ts
  - plugins/agent-relay/src/**
  - plugins/agent-relay/tests/**
  - plugins/claude/src/**
  - plugins/claude/tests/**
  - plugins/codex/src/**
  - plugins/codex/tests/**
  - plugins/hermes-agent/src/**
  - plugins/hermes-agent/tests/**
  - plugins/hermes-agent/README.md
  - packages/cli/src/index.ts
  - packages/cli/src/plugin-commands.ts
  - packages/cli/tests/plugin-commands.test.ts
  - docs/concepts/plugins.md
criteria:
  - { id: A1, statement: "a Claude run loads no user setting source and no MCP server it was not given, and persists no session", proof: "test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1] }
  - { id: A2, statement: "a Claude run whose step names a skill is lent that skill's directory, and only it, and the lent directory is gone after the run", proof: "test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1, S4] }
  - { id: A3, statement: "the relay hands the harness the skill it addressed the prompt to, with the directory it is installed in", proof: "test:packages/agent-kit/tests/HarnessRelay.test.ts", sources: [S4, S6] }
  - { id: A4, statement: "a Codex run ignores the user config, runs without hooks, plugins, apps or memories, and persists no session", proof: "test:plugins/codex/tests/CodexHarness.test.ts", sources: [S2] }
  - { id: A5, statement: "a Hermes run names the configured profile", proof: "test:plugins/hermes-agent/tests/HermesHarness.test.ts", sources: [S3, S5] }
  - { id: A6, statement: "amy init and amy add run each mounted plugin's setup; the Hermes setup clones the profile when it is missing and sets memory off, skill writes to approval and the curator off, and leaves an existing profile alone", proof: "test:plugins/hermes-agent/tests/setup.test.ts", sources: [S5] }
  - { id: A7, statement: "amy doctor is red, with the command that fixes it, when the profile is missing or remembers, writes skills unasked or curates", proof: "test:plugins/hermes-agent/tests/setup.test.ts", sources: [S5] }
  - { id: A8, statement: "the host runs a plugin's setup for the profiles that mount it, and a setup that throws is reported, not fatal", proof: "test:packages/cli/tests/plugin-commands.test.ts", sources: [S5] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "test:plugins/claude/tests/ClaudeHarness.test.ts; the reply is parsed as before, only the argv changed" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "the relay only adds the skill to the context it already passes; no attempt is charged or returned differently" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:packages/cli/tests/plugin-commands.test.ts; setup is plain data read like checks and files, and runs outside the mount" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the only port touched is the harness port, which writes to neither" }
guarantee:
  - { holds: "a Claude run sees no user hook, plugin, MCP server, CLAUDE.md or skill beyond the one its step names, and writes no session or auto-memory", not_against: "managed settings an administrator installed, environment variables in amy's own process, and project settings checked into the repository being worked on, which are the repository's and load as before" }
  - { holds: "a Codex run loads no config.toml, hook, plugin, app or memory", not_against: "~/.codex/AGENTS.md and the skills in ~/.codex/skills or ~/.agents/skills: Codex has no switch for them short of another CODEX_HOME, which would also take the login" }
  - { holds: "a Hermes run writes memory, skills and sessions into the amy profile and never into the operator's own", not_against: "an operator who edits the amy profile back on: the doctor goes red, and the run still happens" }
  - { holds: "amy init creates the profile once and never rewrites one that exists", not_against: "a Hermes release that renames profile create, config set or the keys it sets: the setup reports the failure and the doctor stays red" }
failures:
  - { step: Hermes setup, when: "hermes is not installed or profile create fails", goes_to: "reported by amy init as a failed setup; amy doctor stays red naming the command" }
  - { step: Claude run with a skill, when: "the skill's directory no longer exists", goes_to: "the run goes ahead without it; the relay already refuses at boot a skill that is not installed" }
cut:
  - "Codex's ~/.codex/AGENTS.md and user skills: no flag removes them without a second CODEX_HOME and a second login"
  - "per-step skills for Codex and Hermes: neither reads the relay's /skill prefix the way Claude does, and nothing here changes that"
  - "carrying env or apiKeyHelper from ~/.claude/settings.json into the isolated run: the process environment reaches the CLI as before"
exit: "a ticket run on each of the three CLIs leaves ~/.claude/projects, ~/.codex/sessions and ~/.hermes/memories, ~/.hermes/skills untouched"
---
# A run carries only what amy hands it

amy drives three agent CLIs, and each carried the operator's own setup into a
ticket run and wrote back into it: Claude their CLAUDE.md, skills, hooks and an
auto-memory; Codex their plugins, apps and hook; Hermes, approvals bypassed,
memory and skills into the Hermes the operator talks to. A run should depend
only on what amy configured, and leave the operator's agents as it found them.
