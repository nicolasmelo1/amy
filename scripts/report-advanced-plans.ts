// Names the plans a change advances, for the pull request's checks page.
// Usage: tsx scripts/report-advanced-plans.ts <base-ref>
// Writes to $GITHUB_STEP_SUMMARY when it is set, and to stdout always.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import yaml from "yaml";
import { describeAdvanced, plansAdvancedBy } from "./plans/advanced.js";

const base = process.argv[2];
if (!base) {
  console.error("usage: tsx scripts/report-advanced-plans.ts <base-ref>");
  process.exit(2);
}

const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const policy: { gates?: Record<string, { plan?: string; activation?: string[] }> } =
  yaml.parse(fs.readFileSync(".software-factory/policy.yaml", "utf8")) ?? {};
const gates = Object.entries(policy.gates ?? {}).flatMap(([name, gate]) =>
  gate.plan ? [{ name, plan: gate.plan, activation: gate.activation ?? [] }] : [],
);

const report = describeAdvanced(plansAdvancedBy(changed, gates));
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
