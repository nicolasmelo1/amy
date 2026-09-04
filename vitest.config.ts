import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

// Resolved to source rather than to dist, so a test run does not depend on a
// build having happened first. `tsc --build` is what checks the published
// shape.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "plugins/*/tests/**/*.test.ts"],
    // Named explicitly, or the default pattern walks
    // `.software-factory/mutations` as well, where the repositories are
    // deliberately broken.
    benchmark: { include: ["packages/*/tests/**/*.bench.ts", "plugins/*/tests/**/*.bench.ts"] },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "plugins/*/src/**/*.ts"],
      // Barrels re-export and nothing else, so covering them measures nothing.
      exclude: ["packages/*/src/index.ts", "plugins/*/src/index.ts", "packages/test-fixtures/**"],
      reporter: ["text-summary"],
      // Set just under what the suite achieves today, so coverage can only be
      // ratcheted up. Raise these when they stop hurting, never lower them.
      thresholds: {
        statements: 87,
        branches: 83,
        functions: 85,
        lines: 89,
      },
    },
  },
  resolve: {
    alias: {
      "@amy/core": resolve(here, "packages/core/src/index.ts"),
      "@amy/workflow-ticket-to-qa": resolve(here, "packages/workflow-ticket-to-qa/src/index.ts"),
      "@amy/workflow-note-to-plan": resolve(here, "packages/workflow-note-to-plan/src/index.ts"),
      "@amy/model-specs": resolve(here, "packages/model-specs/src/index.ts"),
      "@amy/plugin-file-queue": resolve(here, "plugins/file-queue/src/index.ts"),
      "@amy/plugin-file-log": resolve(here, "plugins/file-log/src/index.ts"),
      "@amy/plugin-file-store": resolve(here, "plugins/file-store/src/index.ts"),
      "@amy/plugin-file-notes": resolve(here, "plugins/file-notes/src/index.ts"),
      "@amy/plugin-plan-check": resolve(here, "plugins/plan-check/src/index.ts"),
      "@amy/plugin-serial-engine": resolve(here, "plugins/serial-engine/src/index.ts"),
      "@amy/plugin-linear": resolve(here, "plugins/linear/src/index.ts"),
      "@amy/plugin-github": resolve(here, "plugins/github/src/index.ts"),
      "@amy/plugin-claude": resolve(here, "plugins/claude/src/index.ts"),
      "@amy/plugin-command-gate": resolve(here, "plugins/command-gate/src/index.ts"),
      "@amy/plugin-notify-fanout": resolve(here, "plugins/notify-fanout/src/index.ts"),
      "@amy/plugin-notify-hermes": resolve(here, "plugins/notify-hermes/src/index.ts"),
      "@amy/plugin-notify-inbox": resolve(here, "plugins/notify-inbox/src/index.ts"),
      "@amy/agent-kit": resolve(here, "packages/agent-kit/src/index.ts"),
      "@amy/plugin-codex": resolve(here, "plugins/codex/src/index.ts"),
      "@amy/plugin-hermes-agent": resolve(here, "plugins/hermes-agent/src/index.ts"),
      "@amy/plugin-agent-relay": resolve(here, "plugins/agent-relay/src/index.ts"),
      "@amy/cli": resolve(here, "packages/cli/src/index.ts"),
      "@amy/test-fixtures": resolve(here, "packages/test-fixtures/src/index.ts")
    },
  },
});
