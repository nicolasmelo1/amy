#!/bin/sh
# Proves subscription usage through the built workspace's focused contracts.
set -eu

report=${1:-.software-factory/evidence/harness-usage-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repo"

npm run build >/dev/null
npx vitest run \
  packages/agent-kit/tests/usage.test.ts \
  plugins/claude/tests/usage.test.ts \
  plugins/codex/tests/usage.test.ts \
  plugins/hermes-agent/tests/usage.test.ts \
  packages/cli/tests/budget.test.ts \
  packages/cli/tests/status-page.test.ts >/dev/null

# The gate's normalizers must be the published provider exports, not source
# aliases that a packed installation never loads.
node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";

const root = process.cwd();
const claude = await import(pathToFileURL(`${root}/plugins/claude/dist/index.js`).href);
const codex = await import(pathToFileURL(`${root}/plugins/codex/dist/index.js`).href);
const hermes = await import(pathToFileURL(`${root}/plugins/hermes-agent/dist/index.js`).href);

const claudeUsage = claude.parseClaudeUsage(JSON.stringify({ five_hour: { utilization: 42 } }));
const codexUsage = await new codex.CodexUsageReader({
  readRateLimits: async () => ({ rateLimits: { primary: { usedPercent: 18, windowDurationMins: 300 } } }),
}).read();
const hermesUsage = hermes.parseHermesUsage(JSON.stringify({ windows: [{ label: "Session", used_percent: 37 }] }));

if (claudeUsage.windows?.[0]?.usedPercent !== 42 || codexUsage.windows?.[0]?.usedPercent !== 18 || hermesUsage.windows?.[0]?.usedPercent !== 37) {
  throw new Error(`built provider exports did not normalize recorded usage: ${JSON.stringify({ claudeUsage, codexUsage, hermesUsage })}`);
}
NODE

# The built CLI must retain a working reader when another one rejects. A page
# fixture alone cannot prove the command's exception boundary.
world=$(mktemp -d)
trap 'rm -rf "$world"' EXIT
mkdir -p "$world/plugins/node_modules/@fixture/workflow" "$world/plugins/node_modules/@fixture/usage"
core=$(node -p 'require("node:url").pathToFileURL(process.cwd() + "/packages/core/dist/index.js").href')
kit=$(node -p 'require("node:url").pathToFileURL(process.cwd() + "/packages/agent-kit/dist/index.js").href')
printf '{"name":"@fixture/workflow","type":"module","main":"./index.mjs"}\n' > "$world/plugins/node_modules/@fixture/workflow/package.json"
printf 'stateDiagram-v2\n  [*] --> DONE\n  DONE --> [*]\n' > "$world/plugins/node_modules/@fixture/workflow/workflow.mmd"
cat > "$world/plugins/node_modules/@fixture/workflow/index.mjs" <<EOF
import { defineWorkflow, settled } from "$core";
export const plugin = defineWorkflow({ name: "fixture-usage", configSchema: {}, policy: {}, needs: {}, record: () => ({}), decide: { DONE: () => settled("done") }, observe: async () => ({}), actions: {} });
EOF
printf '{"name":"@fixture/usage","type":"module","main":"./index.mjs"}\n' > "$world/plugins/node_modules/@fixture/usage/package.json"
cat > "$world/plugins/node_modules/@fixture/usage/index.mjs" <<EOF
import { definePlugin } from "$core";
import { contributeUsage } from "$kit";
export const plugin = definePlugin({ name: "fixture-usage-readers", register(registry) { registry.engine({ discover: async () => [], tick: async () => undefined }); contributeUsage(registry, { label: "Available", read: async () => ({ windows: [{ label: "Session", usedPercent: 12 }] }) }); contributeUsage(registry, { label: "Rejecting", read: async () => { throw new Error("reader failed"); } }); } });
EOF
cat > "$world/config.yaml" <<'EOF'
workflows:
  probe:
    workflow: "@fixture/workflow"
    plugins: ["@fixture/workflow", "@fixture/usage"]
defaultWorkflow: probe
EOF
AMY_HOME="$world" node packages/cli/dist/index.js status --json > "$world/status.json"
node - "$world/status.json" <<'NODE'
const fs = require("node:fs");
const usage = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).usage;
const available = usage.find((entry) => entry.subscription === "Available");
const rejecting = usage.find((entry) => entry.subscription === "Rejecting");
if (available?.result?.windows?.[0]?.usedPercent !== 12 || rejecting?.result?.unavailable !== "Rejecting usage is unavailable") {
  throw new Error(`built CLI did not retain both reader results: ${JSON.stringify(usage)}`);
}
NODE

node - "$report" <<'NODE'
const fs = require("node:fs");
const report = process.argv[2];
const assertions = [
  "usage.readers_are_product_neutral",
  "usage.recorded_provider_windows_are_normalized",
  "usage.ollama_is_unofficial_without_a_reset",
  "usage.status_keeps_other_readers_after_one_fails",
  "usage.budget_keeps_provider_windows_separate",
].map((type) => ({ type, status: "passed" }));
fs.writeFileSync(report, `${JSON.stringify({
  scenario: "harness-usage",
  status: "passed",
  goal: "A person sees each mounted harness subscription's own account windows beside Amy's ledger, including an unavailable reader without hiding the rest.",
  artifact: { entry: "built workspace contracts for mounted usage readers, status and budget" },
  observed: { assertions_run: assertions.length, assertions_failed: 0 },
  assertions,
}, null, 2)}\n`);
NODE
