---
base: 9cb2378398c434b7ed241bf4551edd78f48da19d
sources:
  - { id: S1, kind: decision, said: "show each subscription's usage and limits the way tucano.sh does for Claude Code and Codex, and the same for Hermes by its provider; use what Hermes offers, and the provider only when it offers nothing. Decided 2026-11-05" }
  - { id: S2, kind: reference, ref: "https://github.com/eduwxyz/tucano", said: "tucano shows Claude's five-hour and seven-day windows, utilization and reset, read from the rate_limit_event of a stream-json run" }
  - { id: S3, kind: code, ref: "packages/cli/src/budget.ts", said: "amy budget counts only amy's own ledger: runs, tokens and dollars per window; nothing reads a subscription's limits" }
  - { id: S4, kind: decision, said: "each harness plugin brings its own usage reader, as it brings its doctor ping; the host only lists what the readers return. Decided 2026-11-05" }
  - { id: S5, kind: decision, said: "a reader returns windows { label, usedPercent, startsAt?, resetsAt? } or unavailable with a reason, and is read on demand, never on a look" }
  - { id: S6, kind: reference, ref: "https://github.com/openai/codex", said: "codex app-server answers account/rateLimits/read with primary and secondary windows, used percent and reset" }
  - { id: S7, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/reference/cli-commands", said: "hermes usage --provider --json returns windows with used_percent and resets_at for openai-codex, anthropic and openrouter; ollama-cloud is not offered" }
  - { id: S8, kind: reference, ref: "https://docs.ollama.com/cloud", said: "Ollama Cloud documents usage only at ollama.com/settings/usage; an undocumented ollama.com/api/usage returns session, weekly and monthly fractions with no reset" }
  - { id: S9, kind: decision, said: "for ollama-cloud the hermes plugin reads the undocumented endpoint and labels it unofficial; Claude reads Claude Code's own OAuth usage endpoint. Decided 2026-11-05" }
  - { id: S10, kind: decision, said: "amy status shows one line per subscription in use, and amy budget shows each provider window under its own label beside amy's own periods, never as one comparison" }
  - { id: S11, kind: decision, said: "a window carries its start and reset when the provider gives them; with neither, it shows its label and percent with period unknown. Decided 2026-11-05" }
touches:
  - packages/agent-kit/src/usage.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/usage.test.ts
  - plugins/claude/src/usage.ts
  - plugins/claude/src/plugin.ts
  - plugins/claude/tests/usage.test.ts
  - plugins/codex/src/usage.ts
  - plugins/codex/src/plugin.ts
  - plugins/codex/tests/usage.test.ts
  - plugins/hermes-agent/src/usage.ts
  - plugins/hermes-agent/src/plugin.ts
  - plugins/hermes-agent/tests/usage.test.ts
  - packages/cli/src/status-view.ts
  - packages/cli/src/budget.ts
  - packages/cli/src/index.ts
  - packages/cli/src/status-page.tsx
  - packages/cli/tests/status.test.ts
  - packages/cli/tests/budget.test.ts
criteria:
  - { id: A1, statement: "a usage reader is a collection a harness plugin contributes to, and the host lists every mounted one without naming a product", proof: "deferred:test:packages/agent-kit/tests/usage.test.ts", sources: [S3, S4, S5] }
  - { id: A2, statement: "recorded Claude, Codex and hermes usage answers become windows with label, percent used and reset", proof: "deferred:test:plugins/hermes-agent/tests/usage.test.ts", sources: [S1, S2, S6, S7] }
  - { id: A3, statement: "on an ollama-cloud profile the hermes reader returns the fractions as windows without a reset, marked unofficial", proof: "deferred:test:plugins/hermes-agent/tests/usage.test.ts", sources: [S8, S9] }
  - { id: A4, statement: "amy status shows one line per subscription a ladder uses, and a reader that fails shows unavailable with its reason", proof: "deferred:test:packages/cli/tests/status.test.ts", sources: [S5, S10] }
  - { id: A5, statement: "amy budget lists each provider window under its label with its start and reset or period unknown, separate from amy's own rolling totals", proof: "deferred:test:packages/cli/tests/budget.test.ts", sources: [S10, S11] }
crosses:
  - { mechanism: status, answer: works, proof: "deferred:A4" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "agent-kit only gains the usage collection; a reading is no agent run and charges nothing" }
  - { mechanism: agent-replies, answer: n/a, why: "a usage reader reads an account endpoint or command, never an agent's reply" }
guarantee:
  - { holds: "reading usage runs no agent, spends no attempt and writes nothing", not_against: "a provider counting the usage request against its own rate limit" }
  - { holds: "a window shown as official comes from a documented command or the CLI's own endpoint", not_against: "an endpoint the provider changes without notice: shown unavailable with its reason" }
failures:
  - { step: read, when: "the endpoint or command fails or times out", goes_to: "that subscription shows unavailable with the reason; the others still show" }
cut:
  - "choosing a rung by how much of a window is left: later, beside the ladder"
  - "a usage history kept by amy: the provider's windows are the truth"
exit: "amy status on a profile laddering Codex and Hermes on Ollama Cloud shows Codex's five-hour and weekly windows with their resets and Ollama's usage marked unofficial"
---
# A harness shows what is left

amy counts its own spend but not the subscription's: a run hits a limit nobody saw
coming. Each harness plugin reads its provider's windows and `amy status` shows them.
