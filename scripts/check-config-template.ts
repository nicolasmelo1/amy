// Checks that the config `amy init` writes is one the built CLI can read,
// and that it names every setting there is.
//
// Usage: tsx scripts/check-config-template.ts
//
// The logic is `checkConfigTemplate` in the CLI package, which the unit tests
// drive against source. This runs it against the build, because the template
// that matters is the one an installed `amy init` writes — and the failure
// this exists for was a template nobody had ever parsed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "yaml";

const repo = path.resolve(import.meta.dirname, "..");

/** A built module, or a refusal that says how to build it. Typed from its source. */
async function built<Module>(spec: string): Promise<Module> {
  const file = path.join(repo, spec);
  if (!fs.existsSync(file)) {
    console.error(`${spec} is not built. Run \`npm run build\` first.`);
    process.exit(1);
  }
  return import(pathToFileURL(file).href);
}

type ConfigTemplate = typeof import("../packages/cli/src/config-template.js");

const { EXAMPLE_CONFIG, DEFAULT_CONFIG } = await built<typeof import("../packages/cli/src/config.js")>(
  "packages/cli/dist/config.js",
);
const { checkConfigTemplate } = await built<ConfigTemplate>("packages/cli/dist/config-template.js");
const ticket = await built<typeof import("../packages/workflow-ticket-to-qa/src/index.js")>(
  "packages/workflow-ticket-to-qa/dist/index.js",
);
const plans = await built<typeof import("../packages/workflow-note-to-plan/src/index.js")>(
  "packages/workflow-note-to-plan/dist/index.js",
);
const errands = await built<typeof import("../packages/workflow-errand/src/index.js")>(
  "packages/workflow-errand/dist/index.js",
);

const document = yaml.parseDocument(EXAMPLE_CONFIG);
const parsed = document.errors.length === 0 ? document.toJS() : {};

const problems = checkConfigTemplate(
  EXAMPLE_CONFIG,
  [
    { at: "", accepts: DEFAULT_CONFIG, given: parsed },
    { at: "policy", accepts: ticket.DEFAULT_POLICY, given: parsed.policy },
    { at: "plans.policy", accepts: plans.DEFAULT_POLICY, given: parsed.plans?.policy },
    { at: "errands.policy", accepts: errands.DEFAULT_POLICY, given: parsed.errands?.policy },
  ],
  document.errors.map((error) => error.message),
);

if (problems.length > 0) {
  console.error("The config template and the settings it documents have drifted apart:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nEdit packages/cli/src/config.ts so the template says what this build reads.");
  process.exit(1);
}

console.log("config template: parses, and names every setting");

// The second half of the claim, and the one that matters most: assembling the
// config `amy init` writes, against the plugins it names, boots. The syntax
// half above can pass while the machine it describes is refused at mount —
// which is how the shipped template's own ladder example was found, on a real
// install, after the file had been provably well-formed for its whole life.
const { checkConfigBoots } = await built<ConfigTemplate>("packages/cli/dist/config-template.js");
const boot = await checkConfigBoots(repo);

if (!boot.ok) {
  console.error("\nThe config `amy init` writes does not boot:\n");
  for (const problem of boot.problems) console.error(`  ${problem}`);
  console.error(
    "\nA fresh install would be refused at its first command. " +
      "Fix the template in packages/cli/src/config.ts, or the mount that refuses it.",
  );
  process.exit(1);
}

console.log("config template: the machine it writes mounts");
