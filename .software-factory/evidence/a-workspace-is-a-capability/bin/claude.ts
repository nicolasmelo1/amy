// The stand-in agent, triaging a support request and drafting its answer.
//
// It reads the request out of the prompt it was handed rather than a script
// of answers: what the draft says is decided by what the customer wrote, so
// a draft that reached the operator is the request's own, not a constant.
// It logs where it was asked to work, which is how the run shows nothing
// handed it a checkout.
import fs from "node:fs";
import path from "node:path";

const world = process.env.AMY_E2E_WORLD;
if (!world) {
  process.stderr.write("AMY_E2E_WORLD names no world for this stand-in\n");
  process.exit(1);
}

if (process.argv.includes("--version")) {
  process.stdout.write("2.0.0 (stand-in)\n");
  process.exit(0);
}

const model = process.argv[process.argv.indexOf("--model") + 1] ?? "";
const prompt = fs.readFileSync(0, "utf-8");

const customer = /^From:\s*(.+)$/m.exec(prompt)?.[1]?.trim() ?? "there";
const queue = /refund|charged|invoice/i.test(prompt) ? "billing" : "general";
const answer = queue === "billing"
  ? `Hi ${customer}, you were charged twice for the same order, and the second charge is refunded today. It reaches your card in three to five working days.`
  : `Hi ${customer}, thank you for writing. Somebody will look at this today.`;

fs.appendFileSync(
  path.join(world, "claude.log"),
  `${JSON.stringify({ at: new Date().toISOString(), model, cwd: process.cwd(), queue, prompt })}\n`,
);

process.stdout.write(
  `${JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    api_error_status: null,
    result: `triage: ${queue}\n${answer}`,
    duration_ms: 900,
    total_cost_usd: 0.0042,
    usage: { input_tokens: 812, output_tokens: 96, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    modelUsage: { [`claude-${model || "sonnet"}-4-5`]: { costUSD: 0.0042 } },
  })}\n`,
);
