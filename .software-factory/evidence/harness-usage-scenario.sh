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

# Recorded provider answers go through each plugin's built dist/index.js, in
# another process: a barrel that forgot an export, or a dist nobody rebuilt,
# fails here though every unit test above imports src.
node --input-type=module - "$repo" <<'NODE'
import { deepStrictEqual } from "node:assert/strict";
import { pathToFileURL } from "node:url";
const built = (name) => import(pathToFileURL(`${process.argv[2]}/plugins/${name}/dist/index.js`).href);
const claude = await built("claude");
const codex = await built("codex");
const hermes = await built("hermes-agent");

deepStrictEqual(claude.parseClaudeUsage(JSON.stringify({
  five_hour: { utilization: 42, resets_at: "2026-11-07T15:00:00.000Z" },
  seven_day: { utilization: 18, resets_at: "2026-11-12T12:00:00.000Z" },
})), { windows: [
  { label: "five-hour", usedPercent: 42, resetsAt: "2026-11-07T15:00:00.000Z" },
  { label: "seven-day", usedPercent: 18, resetsAt: "2026-11-12T12:00:00.000Z" },
] });

deepStrictEqual(await new codex.CodexUsageReader({ readRateLimits: async () => ({ rateLimits: {
  primary: { usedPercent: 24, windowDurationMins: 300, resetsAt: 1_800_000_000 },
  secondary: { usedPercent: 61, windowDurationMins: 10_080, resetsAt: 1_800_604_800 },
} }) }).read(), { windows: [
  { label: "five-hour", usedPercent: 24, startsAt: "2027-01-15T03:00:00.000Z", resetsAt: "2027-01-15T08:00:00.000Z" },
  { label: "weekly", usedPercent: 61, startsAt: "2027-01-15T08:00:00.000Z", resetsAt: "2027-01-22T08:00:00.000Z" },
] });

deepStrictEqual(hermes.parseHermesUsage(JSON.stringify({ provider: "openai-codex", windows: [
  { label: "Session", used_percent: 37, resets_at: "2026-11-07T14:00:00.000Z" },
] })), { windows: [{ label: "Session", usedPercent: 37, resetsAt: "2026-11-07T14:00:00.000Z" }] });

deepStrictEqual(hermes.parseOllamaCloudUsage({ limits: { session: { usage: 0.03 } } }), { windows: [{ label: "Session", usedPercent: 3 }], unofficial: true });
deepStrictEqual(hermes.parseOllamaCloudUsage({ included: { session: { usage: 0.03 } } }), { windows: [{ label: "Session", usedPercent: 3 }], unofficial: true });
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

# The built budget lists both subscriptions beside, never inside, Amy's own
# totals: the provider's 12% leaves every rolling window at zero runs.
AMY_HOME="$world" node packages/cli/dist/index.js budget > "$world/budget.txt"
node - "$world/budget.txt" <<'NODE'
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[2], "utf8");
const [ledger, usage = ""] = text.split("subscription usage:");
const totals = ledger.split("\n").filter((line) => / run\(s\) /.test(line));
if (totals.length === 0 || !totals.every((line) => /\s0 run\(s\) /.test(line)) || /12%|Available|Rejecting/.test(ledger)) {
  throw new Error(`built budget mixed provider windows into Amy's totals:\n${text}`);
}
if (!/Available.*Session: 12%/.test(usage) || !/Rejecting: unavailable/.test(usage)) {
  throw new Error(`built budget did not list both subscriptions beside the ledger:\n${text}`);
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
  artifact: { entry: "the built Claude, Codex and Hermes plugins and the built CLI, each from its dist/index.js" },
  observed: { assertions_run: assertions.length, assertions_failed: 0 },
  assertions,
}, null, 2)}\n`);
NODE
