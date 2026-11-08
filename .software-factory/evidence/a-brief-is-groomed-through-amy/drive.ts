// Replays a recorded amy-groom session through the installed executable and
// writes the gate's report.
//
// Usage: tsx drive.ts <amy> <transcript.json> <report>
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const [amy, transcriptFile, report] = process.argv.slice(2);
if (amy === undefined || transcriptFile === undefined || report === undefined) {
  console.error("usage: drive.ts <amy> <transcript.json> <report>");
  process.exit(2);
}

interface Step {
  readonly argv: readonly string[];
  readonly stdin: string;
}
interface Transcript {
  readonly brief: string;
  readonly steps: readonly Step[];
}
interface Checked {
  readonly ok: boolean;
  readonly refusals: readonly { readonly phase: string | null; readonly section?: string; readonly rule: string }[];
  readonly next: { readonly phase: string | null; readonly section: string } | null;
}

const transcript = JSON.parse(fs.readFileSync(transcriptFile, "utf-8")) as Transcript;
const assertions: { type: string; status: "passed" | "failed" }[] = [];
const record = (type: string, ok: boolean): void => {
  assertions.push({ type, status: ok ? "passed" : "failed" });
  if (!ok) console.error(`FAILED ${type}`);
};

const run = (argv: readonly string[], stdin = "") => {
  const result = spawnSync(amy, argv, { input: stdin, encoding: "utf-8" });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
};

// 1. The sections come from the brief phase's declaration, in its order.
const listed = run(["brief", "sections", "--json"]);
const sections = listed.status === 0 ? (JSON.parse(listed.stdout) as { sections: { phase: string | null; section: string }[] }).sections : [];
record(
  "brief_check.the_sections_are_the_workflows",
  JSON.stringify(sections) === JSON.stringify(["Goal", "Sources", "Criteria", "Out of scope"].map((section) => ({ phase: "brief", section }))),
);

// 2. A refused brief exits non-zero naming the section and the rule; a
// ready one exits zero.
run(["brief", "write", "REFUSED-1", "Goal", "-"], "One currency on the total.");
run(["brief", "write", "REFUSED-1", "Sources", "-"], "S1: the product ticket");
run(["brief", "write", "REFUSED-1", "Criteria", "-"], "- the total shows its currency");
run(["brief", "write", "REFUSED-1", "Out of scope", "-"], "Nothing.");
const refused = run(["brief", "check", "REFUSED-1"]);
run(["brief", "write", "REFUSED-1", "Criteria", "-"], "- the total shows its currency (source: S1)");
const accepted = run(["brief", "check", "REFUSED-1"]);
record(
  "brief_check.a_refused_brief_exits_non_zero_naming_section_and_rule",
  refused.status === 1 && refused.stdout.includes("refused  brief/ Criteria: `- the total shows its currency` names no source") && accepted.status === 0,
);

// 3. The session, replayed: every command it ran is amy's brief command,
// every write goes through `amy brief write`, and every write answers the
// section a still-refusing check just named next.
const allowed = new Set(["sections", "check", "write", "show"]);
let onlyBrief = true;
let followed = true;
let lastCheck: Checked | undefined;
for (const step of transcript.steps) {
  if (step.argv[0] !== "brief" || !allowed.has(step.argv[1] ?? "")) onlyBrief = false;
  const result = run(step.argv, step.stdin);
  if (step.argv[1] === "check" && step.argv.includes("--json")) lastCheck = JSON.parse(result.stdout) as Checked;
  if (step.argv[1] === "write") {
    if (result.status !== 0) followed = false;
    // Every write answers a check: one read as JSON since the last write,
    // still refusing, whose `next` names exactly this section.
    if (!lastCheck || lastCheck.ok || lastCheck.next?.section !== step.argv[3]) followed = false;
    lastCheck = undefined;
  }
}
const writes = transcript.steps.filter((step) => step.argv[1] === "write");
record("brief_check.the_groomer_writes_only_through_the_brief_port", onlyBrief && writes.length >= 4);
record("brief_check.grooming_asks_the_section_the_check_names_next", followed);

// 4. The brief the session groomed is stored through the port, and green.
const shown = run(["brief", transcript.brief, "--json"]);
const text = shown.status === 0 ? (JSON.parse(shown.stdout) as { text: string }).text : "";
const lastAnswer = new Map(writes.map((step) => [step.argv[3], step.stdin.trim()]));
record(
  "brief_check.the_groomed_brief_is_stored_through_the_brief_port",
  [...lastAnswer.values()].every((answer) => answer !== "" && text.includes(answer)),
);
const final = run(["brief", "check", transcript.brief]);
record("brief_check.the_groomed_brief_is_green", final.status === 0 && final.stdout.includes("ready"));

// 5. The doctor names the check the brief phase exports.
const doctor = run(["doctor"]);
record("brief_check.the_doctor_names_the_brief_check", doctor.stdout.includes("ok   brief check  `brief/` (workflow-invoices-brief) judges Goal, Sources, Criteria, Out of scope"));

const failed = assertions.filter((one) => one.status !== "passed");
fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "a-brief-is-groomed-through-amy",
      status: failed.length === 0 ? "passed" : "failed",
      goal: "A project's brief phase declares four sections and a check. An agent that is not the one running amy grooms a brief with the shipped amy-groom skill: it asks the sections the workflow declares, in order, writes every answer through amy's brief port, runs the check after each, and stops when it is green. Replayed through the installed executable, the sections are the workflow's, a refused brief exits non-zero naming the section and the rule, and the groomed brief is stored and green.",
      artifact: { package: "@amykit/cli", entry: "packages installed by npm, run by node", built_by: "scripts/install.sh" },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        transcript_steps: transcript.steps.length,
        sections_written: writes.length,
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
process.exit(failed.length === 0 ? 0 : 1);
