---
base: 2bbe1923bbfd4dc21a6f23fa21bff168cb1d0e45
sources:
  - { id: S1, kind: code, ref: "plugins/claude/src/usage.ts", symbol: "oauthToken", said: "the reader takes Claude Code's OAuth token from CLAUDE_CODE_OAUTH_TOKEN, ~/.claude/.credentials.json or the macOS Keychain through security find-generic-password" }
  - { id: S2, kind: code, ref: "plugins/claude/src/usage.ts", symbol: "read", said: "it then sends that token with curl to api.anthropic.com/api/oauth/usage under an oauth beta header" }
  - { id: S3, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/plan-usage.ts", symbol: "probeClaudeUsage", said: "a short-lived claude -p over stream-json answers initialize, then get_usage, with rate_limits; no settings, hooks or MCP servers load and no session is kept" }
  - { id: S4, kind: reference, said: "recorded 2026-11-15 on Claude Code 2.1.325: get_usage answered rate_limits_available true, five_hour 2% and seven_day 30%, resets_at with microseconds and +00:00 (`2026-11-15T19:19:59.758635+00:00`), session.total_cost_usd 0, no model call" }
  - { id: S5, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/plan-usage.ts", symbol: "withRateLimit", said: "on a setup-token sign-in, get_usage had no limits to read in Claude Code 2.1.312 to 2.1.316" }
  - { id: S6, kind: reference, ref: "docs/design/a-harness-shows-what-is-left.md", said: "a reader returns windows or unavailable; reading usage runs no agent, spends no attempt and writes nothing; one failed reader leaves the others visible" }
  - { id: S7, kind: decision, said: "amy never reads a credential that belongs to a harness: Claude Code reads its own login and amy asks it. Proposed 2026-11-12" }
  - { id: S8, kind: decision, said: "the probe needs the runner's managed spawn, as codex app-server does; a runner without one reads as unavailable. Proposed 2026-11-12" }
touches:
  - plugins/claude/src/usage.ts
  - plugins/claude/src/plugin.ts
  - plugins/claude/tests/usage.test.ts
  - plugins/claude/tests/usage.review.test.ts
  - plugins/claude/tests/fixtures/get-usage-2.1.325.jsonl
  - packages/core/src/ports/CommandRunner.ts
  - packages/core/src/NodeCommandRunner.ts
  - plugins/claude/README.md
  - docs/concepts/harnesses.md
  - docs/design/a-harness-shows-what-is-left.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/harness-usage-scenario.sh
  - registry/plugin-claude.json
  - docs/development/the-gate.md
  - docs/start/installation.md
criteria:
  - { id: A1, statement: "the recorded get_usage answer normalizes to five-hour and seven-day windows with their percentages and resets; opus and sonnet windows appear only when not null", proof: "deferred:test:plugins/claude/tests/usage.test.ts", sources: [S3, S4] }
  - { id: A2, statement: "reading usage runs no curl and no security, opens no credentials file and reads no token variable", proof: "deferred:test:plugins/claude/tests/usage.test.ts", sources: [S1, S2, S7] }
  - { id: A3, statement: "the probe sends only initialize and get_usage, passes no prompt, loads no settings or MCP servers, keeps no session, and ends the child once answered", proof: "deferred:test:plugins/claude/tests/usage.test.ts", sources: [S3, S6] }
  - { id: A4, statement: "rate_limits_available false, an error response, or no answer within timeoutMs is unavailable naming why, and a hung child is killed", proof: "deferred:test:plugins/claude/tests/usage.test.ts", sources: [S5, S6] }
  - { id: A5, statement: "a runner with no managed spawn reads Claude usage as unavailable, saying so, while the other readers still answer", proof: "deferred:test:plugins/claude/tests/usage.test.ts", sources: [S6, S8] }
  - { id: A6, statement: "the built reader, in another process with HOME empty and a stand-in claude printing the recording, gives A1's windows and touches no file under HOME", proof: "assertion:usage.claude_is_asked_not_its_token", sources: [S4, S7] }
  - { id: A7, statement: "recorded Claude, Codex and Hermes answers still normalize to labeled percentage windows", proof: "assertion:usage.recorded_provider_windows_are_normalized", sources: [S6] }
crosses:
  - { mechanism: agent-replies, answer: n/a, why: "the reader asks Claude Code about its account; no agent turn runs and no reply is read" }
  - { mechanism: status, answer: works, proof: "assertion:usage.status_keeps_other_readers_after_one_fails" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "CommandRunner only gains an option a caller may ask for; it writes to neither the tracker nor the code host, and the reader writes nothing at all" }
guarantee:
  - { holds: "amy reads no Claude credential, from any place, to show usage", not_against: "Claude Code itself reading its own login to answer" }
  - { holds: "a probe never runs a model turn", not_against: "a Claude Code release that bills an initialize" }
failures:
  - { step: probe, when: "a Claude Code release drops or renames get_usage, which is not in the public docs", goes_to: "Claude usage is unavailable naming the answer; status and budget go on" }
  - { step: probe, when: "claude is not on PATH", goes_to: "unavailable, naming the command" }
cut:
  - "the OAuth endpoint, the Keychain and the credentials file as fallbacks (S7)"
  - "windows from a run's rate_limit_event: Claude says its limit while it runs reads limits, not windows"
exit: "amy budget shows Claude's five-hour and seven-day windows on a machine where amy cannot read any Claude credential"
---
# Claude's usage is read without its token

To show Claude's usage, amy takes Claude Code's OAuth token from the Keychain
or its credentials file and calls an undocumented endpoint with it. Claude
Code will report the same windows itself, through `get_usage` over
stream-json, with no model call. amy asks it and never touches the token.
