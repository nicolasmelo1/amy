// Checks that delivered work is proved by durable design notes, while
// plans/ remains an honest list of unfinished work.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "yaml";

const repo = path.resolve(import.meta.dirname, "..");
const file = (relative) => path.join(repo, relative);

if (!fs.existsSync(file("packages/cli/dist/plan-board.js"))) {
  console.error("packages/cli/dist/plan-board.js is not built. Run `npm run build` first.");
  process.exit(1);
}

const { checkPlanBoard } = await import(pathToFileURL(file("packages/cli/dist/plan-board.js")).href);
const policy = yaml.parse(fs.readFileSync(file(".software-factory/policy.yaml"), "utf8"));
const nextSteps = fs.readFileSync(file("plans/next-steps.md"), "utf8");
const listedPlans = nextSteps.split("\n").flatMap((line) => {
  const start = line.indexOf("](");
  if (start < 0) return [];
  const end = line.indexOf(")", start + 2);
  if (end < 0) return [];
  const target = line.slice(start + 2, end).split("#", 1)[0];
  if (!target.endsWith(".md")) return [];
  return [target.startsWith("plans/") ? target : `plans/${target}`];
});
const planFiles = fs.readdirSync(file("plans"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => `plans/${entry.name}`);
const designNotes = Object.fromEntries(
  fs.readdirSync(file("docs/design"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const relative = `docs/design/${entry.name}`;
      return [relative, fs.readFileSync(file(relative), "utf8")];
    }),
);
const gates = Object.entries(policy.gates ?? {}).map(([name, gate]) => ({
  name,
  plan: gate.plan,
  requiredAssertions: gate.required_assertions ?? [],
}));
const problems = checkPlanBoard({ gates, planFiles, listedPlans, designNotes });

if (problems.length > 0) {
  console.error("The plan board and the gate policy have drifted apart:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log("plan board: gates cite durable design notes, and plans list unfinished work");
