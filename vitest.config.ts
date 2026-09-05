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
      "@amykit/core": resolve(here, "packages/core/src/index.ts"),
      "@amykit/workflow-ticket-to-qa": resolve(here, "packages/workflow-ticket-to-qa/src/index.ts"),
      "@amykit/workflow-note-to-plan": resolve(here, "packages/workflow-note-to-plan/src/index.ts"),
      "@amykit/model-specs": resolve(here, "packages/model-specs/src/index.ts"),
      "@amykit/plugin-file-queue": resolve(here, "plugins/file-queue/src/index.ts"),
      "@amykit/plugin-file-log": resolve(here, "plugins/file-log/src/index.ts"),
      "@amykit/plugin-file-store": resolve(here, "plugins/file-store/src/index.ts"),
      "@amykit/plugin-file-notes": resolve(here, "plugins/file-notes/src/index.ts"),
      "@amykit/plugin-plan-check": resolve(here, "plugins/plan-check/src/index.ts"),
      "@amykit/plugin-serial-engine": resolve(here, "plugins/serial-engine/src/index.ts"),
      "@amykit/plugin-linear": resolve(here, "plugins/linear/src/index.ts"),
      "@amykit/plugin-github": resolve(here, "plugins/github/src/index.ts"),
      "@amykit/plugin-claude": resolve(here, "plugins/claude/src/index.ts"),
      "@amykit/plugin-command-gate": resolve(here, "plugins/command-gate/src/index.ts"),
      "@amykit/plugin-notify-fanout": resolve(here, "plugins/notify-fanout/src/index.ts"),
      "@amykit/plugin-notify-hermes": resolve(here, "plugins/notify-hermes/src/index.ts"),
      "@amykit/plugin-notify-inbox": resolve(here, "plugins/notify-inbox/src/index.ts"),
      "@amykit/agent-kit": resolve(here, "packages/agent-kit/src/index.ts"),
      "@amykit/plugin-codex": resolve(here, "plugins/codex/src/index.ts"),
      "@amykit/plugin-hermes-agent": resolve(here, "plugins/hermes-agent/src/index.ts"),
      "@amykit/plugin-agent-relay": resolve(here, "plugins/agent-relay/src/index.ts"),
      "@amykit/cli": resolve(here, "packages/cli/src/index.ts"),
      "@amykit/test-fixtures": resolve(here, "packages/test-fixtures/src/index.ts")
    },
  },
});
