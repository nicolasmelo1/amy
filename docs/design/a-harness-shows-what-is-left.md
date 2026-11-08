---
base: 93d59dea5bcd9a218a2e3f657bcfae8c26df5382
sources:
  - { id: S1, kind: decision, said: "show each subscription's usage and limits by provider; use the harness command when it offers one. Decided 2026-11-05" }
  - { id: S2, kind: code, ref: "packages/cli/src/budget.ts", symbol: "budgetLines", said: "amy budget counts its own ledger and keeps provider windows separate" }
  - { id: S3, kind: decision, said: "each harness contributes one on-demand usage reader that returns windows or unavailable. Decided 2026-11-05" }
  - { id: S4, kind: reference, ref: "https://github.com/openai/codex", said: "codex app-server answers account/rateLimits/read with account windows" }
  - { id: S5, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/reference/cli-commands", said: "hermes usage reports configured account rate-limit windows as JSON" }
  - { id: S6, kind: reference, ref: "https://docs.ollama.com/api/balance", said: "Ollama balance accepts bearer API keys and reports included allowance, remaining balance and period." }
touches:
  - packages/agent-kit/src/**
  - packages/agent-kit/tests/**
  - plugins/claude/src/**
  - plugins/claude/tests/**
  - plugins/claude/README.md
  - plugins/codex/src/**
  - plugins/codex/tests/**
  - plugins/codex/README.md
  - plugins/hermes-agent/src/**
  - plugins/hermes-agent/tests/**
  - plugins/hermes-agent/README.md
  - plugins/telegram/src/**
  - plugins/telegram/tests/plugin.test.ts
  - plugins/file-log/src/**
  - plugins/file-log/tests/**
  - plugins/file-queue/src/**
  - plugins/file-queue/tests/**
  - plugins/file-store/src/**
  - plugins/file-store/tests/**
  - plugins/file-brief-store/src/**
  - plugins/file-brief-store/tests/**
  - plugins/file-notes/src/**
  - plugins/file-notes/tests/**
  - plugins/file-tasks/src/**
  - plugins/file-tasks/tests/**
  - packages/cli/src/{assemble,index,workflow}.ts
  - packages/cli/src/budget.ts
  - packages/cli/src/status-page.tsx
  - packages/cli/tests/**
  - packages/cli/package.json
  - packages/core/src/{mount,plugin}.ts
  - package-lock.json
  - registry/{agent-kit,cli,core,plugin-claude,plugin-codex,plugin-file-brief-store,plugin-file-log,plugin-file-notes,plugin-file-queue,plugin-file-store,plugin-file-tasks,plugin-hermes-agent,plugin-telegram}.json
  - scripts/write-install-manifest.ts
  - .software-factory/policy.yaml
  - .software-factory/evidence/harness-usage-scenario.sh
  - .software-factory/evidence/harness-usage*.json
  - docs/**
  - README.md
criteria:
  - { id: A1, statement: "a harness contributes one product-neutral usage reader and the host lists mounted readers", proof: "assertion:usage.readers_are_product_neutral", sources: [S2, S3], done: true }
  - { id: A2, statement: "recorded Claude, Codex and Hermes answers normalize to labeled percentage windows and provider resets", proof: "assertion:usage.recorded_provider_windows_are_normalized", sources: [S1, S4, S5], done: true }
  - { id: A3, statement: "an Ollama Cloud API-key reader returns included-credit percent and provider period; legacy fractions remain unofficial", proof: "assertion:usage.ollama_is_unofficial_without_a_reset", sources: [S6], done: true }
  - { id: A4, statement: "status shows subscriptions independently and keeps a failed reader visible as unavailable", proof: "assertion:usage.status_keeps_other_readers_after_one_fails", sources: [S1, S3], done: true }
  - { id: A5, statement: "budget lists provider windows beside, never inside, Amy's rolling totals", proof: "assertion:usage.budget_keeps_provider_windows_separate", sources: [S1, S2], done: true }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:plugins/file-queue/tests/FileQueue.test.ts; inspection mount reads absent storage without creating it" }
  - { mechanism: workflow-tooling, answer: n/a, why: "inspection only reads a mounted workflow and adds no workflow tooling" }
  - { mechanism: status, answer: works, proof: "assertion:usage.status_keeps_other_readers_after_one_fails" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "usage reads no agent and creates no attempt" }
  - { mechanism: agent-replies, answer: n/a, why: "readers query account usage, never an agent reply" }
  - { mechanism: queue-and-store, answer: works, proof: "test:plugins/file-queue/tests/FileQueue.test.ts; inspection reads absent storage without creating it" }
  - { mechanism: events-and-notifications, answer: works, proof: "test:plugins/file-log/tests/FileEventLog.test.ts; inspection reads an absent log without creating it" }
  - { mechanism: briefs, answer: works, proof: "test:plugins/file-brief-store/tests/FileBriefStore.test.ts; inspection reads an absent brief directory without creating it" }
guarantee:
  - { holds: "reading usage runs no agent, spends no attempt and writes nothing", not_against: "provider-side accounting of an account request" }
failures:
  - { step: read, when: "a provider answer fails", goes_to: "that subscription reports unavailable while the others remain visible" }
cut:
  - "choosing a rung from account usage"
exit: "status and budget show normalized provider windows beside Amy's own ledger"
---
# A harness shows what is left

Harnesses now expose account windows only on explicit inspection; the usage gate proves normalization, unavailable readers and the separate ledger.