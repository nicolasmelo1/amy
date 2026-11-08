---
base: 330ec3de00869241d24025edbd3b6a6eb5184f53
sources:
  - { id: S1, kind: friction, said: "2026-11-05: a model named in config.yaml is only found to be wrong when a run fails mid-workflow; setting Hermes to one subscription and one of its models is not obvious, so it must be checked before anything runs" }
  - { id: S2, kind: decision, said: "amy doctor pings every model the selected profile's ladders name, and fails there rather than during the work. Decided 2026-11-05" }
  - { id: S3, kind: decision, said: "each harness plugin brings its own ping as a doctor check and finds its cheapest way to ask whether it answers; the host knows nothing about how. Decided 2026-11-05" }
  - { id: S4, kind: code, ref: "packages/core/src/plugin.ts", symbol: "checks", said: "a plugin already brings checks amy doctor runs after its own, under the plugin's name" }
  - { id: S5, kind: code, ref: "packages/core/src/commands.ts", symbol: "PluginCheck", said: "a check gets state, home, settings and out; no runner, no mounted harness" }
  - { id: S6, kind: code, ref: "packages/cli/src/slices.ts", symbol: "tiersFor", said: "a harness plugin's models setting is every tier the default and per-step ladders ask of it, so its settings already name exactly what to ping" }
  - { id: S7, kind: code, ref: "packages/cli/src/doctor.ts", said: "no check asks a model anything; claude --version runs whatever the ladder holds" }
  - { id: S8, kind: code, ref: "plugins/hermes-agent/src/plugin.ts", said: "the hermes check only reads the profile; the provider and its keys live in that profile, so a wrong model or subscription shows only when a run fails" }
  - { id: S9, kind: decision, said: "a ping is one tiny prompt per configured model, asking for one word back, run directly on the harness CLI and never through the relay, so it reaches no budget, no attempt and no event log. Decided 2026-11-05" }
  - { id: S10, kind: decision, said: "a failed ping names the plugin, the model and the CLI's own first line of error, and amy doctor exits non-zero; a model that answers says how long it took" }
  - { id: S11, kind: decision, said: "the claude, codex and hermes-agent plugins each ship a ping for every model in their models setting, and a bare tier pings the CLI's default model" }
  - { id: S12, kind: decision, said: "a ping passes only on exit 0 with a non-empty stdout; anything else fails, and the error shown is the first non-empty line of stderr, else of stdout. Decided 2026-11-08" }
  - { id: S13, kind: decision, said: "a ladder entry whose harness plugin ships no ping, or a doctor run that pinged zero models, fails the check by name; it is never green. Decided 2026-11-08" }
  - { id: S14, kind: decision, said: "success reads at least one item; a declared refusal is a condition this plan names; anything else is an internal error, never retried as expected; a check that read nothing is never green. Decided 2026-11-08" }
touches:
  - packages/agent-kit/src/ping.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/ping.test.ts
  - plugins/claude/src/plugin.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - plugins/codex/src/plugin.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - plugins/hermes-agent/src/plugin.ts
  - plugins/hermes-agent/src/HermesHarness.ts
  - plugins/hermes-agent/tests/HermesHarness.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/doctor.test.ts
  - docs/start/status-and-doctor.md
criteria:
  - { id: A1, statement: "with hermes:glm and hermes:gpt in two ladders, amy doctor runs exactly one ping per model, under the hermes-agent plugin's name", proof: "deferred:test:plugins/hermes-agent/tests/HermesHarness.test.ts", sources: [S2, S3, S4, S6, S11] }
  - { id: A2, statement: "a model the stand-in CLI refuses fails doctor naming plugin, model and the CLI's first error line, and doctor exits non-zero", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S1, S7, S8, S10] }
  - { id: A3, statement: "a ping writes nothing to the event log, the budget ledger or any record", proof: "deferred:test:packages/agent-kit/tests/ping.test.ts", sources: [S5, S9] }
  - { id: A4, statement: "the claude and codex plugins ping each configured model, and a bare tier pings the CLI default", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S11] }
  - { id: A5, statement: "a stand-in CLI that exits 0 with empty stdout, or exits non-zero with a reply on stdout, fails the ping; the error shown is stderr's first non-empty line, else stdout's", proof: "deferred:test:packages/agent-kit/tests/ping.test.ts", sources: [S10, S12] }
  - { id: A6, statement: "a ladder naming a harness whose plugin ships no ping fails doctor naming that harness, and a profile whose ladders ping nothing fails doctor rather than passing", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S13, S14] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A2; a ping reply is read as data, an empty or failed one is a failed check" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "agent-kit only gains a ping helper; a ping is no agent run, so no attempt is charged or given back (S9)" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "a ping never goes through the relay or the budget check (S9)" }
guarantee:
  - { holds: "a model the ladders name that cannot answer fails amy doctor before any work runs", not_against: "a provider that answers the ping and fails later, mid-run" }
  - { holds: "a ping spends no attempt and no budget", not_against: "the provider's own bill for one tiny prompt per model" }
  - { holds: "amy doctor is green on the ladders only when every model they name answered its ping", not_against: "a provider that prints a refusal on stdout and exits 0: a non-empty reply is read as an answer" }
failures:
  - { step: ping, when: "the CLI is not installed", goes_to: "a failed check naming the CLI, as claude --version does today" }
  - { step: ping, when: "the CLI hangs", goes_to: "a failed check after the plugin's timeoutMs, naming the model" }
  - { step: ping, when: "exit 0 with an empty stdout, or a non-zero exit whatever it printed", goes_to: "a failed check naming the model and the first non-empty line of stderr, else stdout" }
  - { step: doctor, when: "a ladder's harness ships no ping, or no model was pinged", goes_to: "a failed check naming the harness or the profile; never green" }
cut:
  - "a ping run by the host: refused, only the plugin knows its CLI (S3)"
  - "pinging on every tick: refused, doctor is the place"
exit: "amy doctor on a profile whose ladder names a Hermes model the subscription does not serve fails, naming hermes-agent, that model and Hermes' own error, before any work is picked up"
---
# A harness answers before the work

A wrong model in `config.yaml` is found by the first run that fails. Each harness
plugin pings the models it was given, so `amy doctor` fails first.
