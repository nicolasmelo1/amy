#!/bin/sh
# The `plugin-agent-relay` gate's scenario, as a repeatable run.
#
# Usage: plugin-agent-relay-scenario.sh [report-path]
#
# Mounts the *built* claude, codex and relay plugins in a separate process,
# with fake `claude` and `codex` executables on the PATH, and drives the
# `agent` port that comes out. So the policy is proved through the real
# artifacts: the real argv, the real envelope parsing, the real mount, and the
# real relay.
#
# The fakes are the only pretend part, and they have to be: proving that a
# quota moves to another harness means producing a quota, and no credential
# can be asked to do that on demand.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-agent-relay-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)

for pkg in plugins/agent-relay plugins/claude plugins/codex packages/core; do
  test -f "$repo/$pkg/dist/index.js" ||
    { echo "build it first: npm run build ($pkg)" >&2; exit 1; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/checkouts/widgets"

# A claude that behaves as AMY_E2E_CLAUDE says, per model. Every invocation is
# appended to a log so the scenario can assert who was *not* called, which is
# half of what the policy promises.
cat > "$work/bin/claude" <<'FAKE'
#!/bin/sh
prompt=$(cat)
model=""
while [ $# -gt 0 ]; do
  case $1 in --model) model=$2; shift 2 ;; *) shift ;; esac
done
# A skill is invoked by naming it on the first line, so that is where the
# fake reads it from. Absent, the line reads exactly as it did before.
skill=$(printf '%s' "$prompt" | head -1 | sed -n 's|^/\([A-Za-z0-9_-][A-Za-z0-9_-]*\).*|\1|p')
if [ -n "$skill" ]; then
  echo "claude:$model:$skill" >> "$AMY_E2E_CALLS"
else
  echo "claude:$model" >> "$AMY_E2E_CALLS"
fi

# The real CLI reports the model that actually ran, under a full id with a
# window suffix, not the short alias that was asked for. The fake has to do
# the same or the scenario would be proving something easier than the truth.
envelope() {
  printf '{"type":"result","subtype":"%s","is_error":%s,"api_error_status":%s,"result":"{\\"clear\\": true}","duration_ms":10,"total_cost_usd":0.01,"usage":{"input_tokens":2,"output_tokens":4,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"modelUsage":{"claude-%s-4-5[1m]":{"costUSD":0.01}}}\n' "$1" "$2" "$3" "$model"
}

case "$AMY_E2E_CLAUDE" in
  throttled)
    # A 429 in the envelope, which is the only place a quota is stated.
    envelope error_during_execution true 429
    exit 1
    ;;
  weak-model-fails)
    if [ "$model" = "sonnet" ]; then
      envelope error_during_execution true null
      exit 1
    fi
    envelope success false null
    ;;
  first-skill-fails)
    if [ "$skill" = "first-skill" ]; then
      envelope error_during_execution true null
      exit 1
    fi
    envelope success false null
    ;;
  *)
    envelope success false null
    ;;
esac
FAKE

cat > "$work/bin/codex" <<'FAKE'
#!/bin/sh
cat > /dev/null
model=""
while [ $# -gt 0 ]; do
  case $1 in --model) model=$2; shift 2 ;; *) shift ;; esac
done
echo "codex:$model" >> "$AMY_E2E_CALLS"
printf '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"clear\\": true}"}}\n'
printf '{"type":"turn.completed","usage":{"input_tokens":17571,"cached_input_tokens":11008,"cache_write_input_tokens":0,"output_tokens":5}}\n'
FAKE

chmod +x "$work/bin/claude" "$work/bin/codex"

PATH="$work/bin:$PATH" node --input-type=module - "$work" "$repo" "$report" <<'PROBE'
import fs from "node:fs";
import path from "node:path";

const [work, repo, report] = process.argv.slice(2);
const dist = (...where) => path.join(repo, ...where, "dist", "index.js");

const { mount, NodeCommandRunner } = await import(dist("packages", "core"));
const { plugin: claude } = await import(dist("plugins", "claude"));
const { plugin: codex } = await import(dist("plugins", "codex"));
const { plugin: relay } = await import(dist("plugins", "agent-relay"));

const assertions = [];
const record = (type, ok) => assertions.push({ type, status: ok ? "passed" : "failed" });

const calls = path.join(work, "calls.log");
process.env.AMY_E2E_CALLS = calls;

const TICKET = {
  id: "PROJ-1239",
  title: "The invoice total is wrong",
  url: "https://tracker.test/PROJ-1239",
  repo: "acme/widgets",
  branch: "proj-1239",
};

/** Mounts the three built plugins with a ladder, and returns the agent port. */
async function hostWith(ladder, { budget, seed = [], skills } = {}) {
  const events = [...seed];
  const outcome = await mount(
    [claude, codex, relay],
    {
      "@amykit/plugin-claude": { defaultBranch: "main", models: ["sonnet", "opus"] },
      "@amykit/plugin-codex": { defaultBranch: "main", models: ["gpt-5"] },
      "@amykit/plugin-agent-relay": {
        ladder,
        ...(budget === undefined ? {} : { budget }),
        ...(skills === undefined ? {} : { skills, skillRoots: [path.join(work, "skills")] }),
      },
    },
    {
      runner: new NodeCommandRunner(),
      now: () => new Date("2026-09-03T12:00:00.000Z"),
      log: { append: (event) => events.push(event), read: () => [...events] },
      paths: { workspace: path.join(work, "checkouts"), state: path.join(work, ".amy") },
    },
  );

  return {
    outcome,
    events,
    agent: outcome.ok ? outcome.mounted.ports.get("agent") : null,
    budget: outcome.ok ? outcome.mounted.ports.get("budget") : null,
  };
}

/** An agent run as the worker writes one, with only what a budget reads. */
function spent(at, costUsd) {
  return {
    at,
    kind: "agent.run",
    detail: { costSource: "reported", costUsd, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
  };
}

const LADDER = ["claude:sonnet", "claude:opus", "codex:gpt-5"];

function reset(mode) {
  fs.writeFileSync(calls, "");
  process.env.AMY_E2E_CLAUDE = mode;
}

const called = () => fs.readFileSync(calls, "utf-8").trim().split("\n").filter(Boolean);

// 1. The relay is what mounts the port. The harnesses only contribute, so
// without it the agent actions have no owner at all.
{
  const { outcome, agent } = await hostWith(LADDER);
  record("relay.mounts_the_agent_port", outcome.ok === true && Boolean(agent));

  const withoutRelay = await mount([claude, codex], {
    "@amykit/plugin-claude": { defaultBranch: "main", models: ["sonnet"] },
    "@amykit/plugin-codex": { defaultBranch: "main", models: ["gpt-5"] },
  }, {
    runner: new NodeCommandRunner(),
    now: () => new Date(),
    paths: { workspace: path.join(work, "checkouts"), state: path.join(work, ".amy") },
  });

  record(
    "relay.is_the_only_owner_of_the_agent_port",
    withoutRelay.ok === true && !withoutRelay.mounted.ports.has("agent"),
  );
}

// 2. The happy path: the first rung answers and nothing else is disturbed.
{
  reset("fine");
  const { agent } = await hostWith(LADDER);
  const result = await agent.triage(TICKET);

  record("relay.first_rung_answers_when_it_works", result.value.clear === true);
  record("relay.asks_nobody_else_when_the_first_rung_worked", called().length === 1);
}

// 3. A failure escalates the model, inside the same harness.
{
  reset("weak-model-fails");
  const { agent, events } = await hostWith(LADDER);
  const result = await agent.triage(TICKET);

  const asked = called();
  record("relay.escalates_the_model_after_a_failure", asked.join(",") === "claude:sonnet,claude:opus");
  // The model the envelope named, which is the one that actually ran rather
  // than the one that was asked for.
  record("relay.answers_from_the_stronger_model", result.run.model === "claude-opus-4-5[1m]");
  // codex sat right there and was correctly left alone: a failure has a
  // stronger model to try before it is worth changing harness.
  record("relay.does_not_change_harness_on_a_failure", !asked.some((c) => c.startsWith("codex")));

  const handoff = events.filter((e) => e.kind === "agent.handoff");
  record("relay.records_the_handoff_with_its_cause", handoff[0]?.detail?.cause === "failed");
  record("relay.records_which_axis_moved", handoff[0]?.detail?.moved === "model");
}

// 4. A quota changes harness, and skips the rest of the throttled one.
{
  reset("throttled");
  const { agent, events } = await hostWith(LADDER);
  const result = await agent.triage(TICKET);

  const asked = called();
  record("relay.changes_harness_after_a_rate_limit", result.run.harness === "codex");
  // claude:opus is next in the ladder and is deliberately skipped: it sits
  // behind the same quota that just refused.
  record("relay.skips_the_rest_of_the_throttled_harness", asked.join(",") === "claude:sonnet,codex:gpt-5");

  const handoff = events.filter((e) => e.kind === "agent.handoff");
  record("relay.records_the_rate_limit_as_the_cause", handoff[0]?.detail?.cause === "rate-limited");
  record("relay.records_the_harness_axis", handoff[0]?.detail?.moved === "harness");
}

// 5. The handbrake. A killed or missing binary must not raise a fresh one.
{
  reset("fine");
  const { agent } = await hostWith(["claude:sonnet", "codex:gpt-5"]);

  // An empty PATH is what a killed child and a missing binary look like from
  // here: the command cannot be run at all.
  const previous = process.env.PATH;
  process.env.PATH = path.join(work, "empty");
  let outcome;
  try {
    outcome = await agent.triage(TICKET).then((r) => r.run.outcome, () => "threw");
  } finally {
    process.env.PATH = previous;
  }

  record("relay.reports_an_unrunnable_harness_as_abandoned", outcome === "abandoned");
  // The property that matters: `amy stop` kills the child, and if the relay
  // treated that as a failure it would start a new process on the next
  // harness the instant the operator pulled the handbrake.
  record("relay.starts_nothing_else_after_an_abandoned_run", called().length === 0);
}

// 6. A ladder with a typo in it is refused while boot can still refuse.
{
  const { outcome } = await hostWith(["claude:sonnet", "claude:opuss"]);

  record("relay.refuses_an_unknown_agent_at_boot", outcome.ok === false);
  record(
    "relay.names_the_unknown_agent_and_the_choices",
    outcome.ok === false &&
      outcome.problems.join("\n").includes("claude:opuss") &&
      outcome.problems.join("\n").includes("codex:gpt-5"),
  );
}

// 7. The ceiling on spending, which is the other half of letting this thing
// run overnight: the relay is what mounts it, and it is asked before a call.
{
  const { outcome: uncapped } = await hostWith(LADDER);
  record("relay.mounts_no_budget_when_no_ceiling_is_set", uncapped.ok === true && !uncapped.mounted.ports.has("budget"));

  const { budget } = await hostWith(LADDER, { budget: { perFiveHours: { costUsd: 20 } } });
  record("relay.mounts_a_budget_when_a_ceiling_is_set", Boolean(budget));

  // Nineteen dollars in the last hour, against a twenty dollar ceiling that
  // stops at nine tenths. Read from the log, not from a tally of its own.
  const seed = [spent("2026-09-03T11:00:00.000Z", 19)];
  const spentHost = await hostWith(LADDER, { budget: { perFiveHours: { costUsd: 20 } }, seed });
  const decision = spentHost.budget.mayStart(new Date("2026-09-03T12:00:00.000Z"));

  record("relay.stops_new_work_at_the_ceiling", decision.ok === false && decision.measure === "costUsd");
  record("relay.says_which_window_stopped_the_work", decision.ok === false && decision.window === "perFiveHours");

  const quiet = await hostWith(LADDER, { budget: { perFiveHours: { costUsd: 500 } }, seed });
  record(
    "relay.starts_work_while_the_window_has_room",
    quiet.budget.mayStart(new Date("2026-09-03T12:00:00.000Z")).ok === true,
  );

  const typo = await hostWith(LADDER, { budget: { perDay: { costUsd: 20 } } });
  record("relay.refuses_a_budget_it_cannot_mean_at_boot", typo.outcome.ok === false);
}

// 8. A skill per step: the same ladder, asking who should do the work rather
// than who is still within quota.
{
  for (const name of ["first-skill", "second-skill"]) {
    fs.mkdirSync(path.join(work, "skills", name), { recursive: true });
    fs.writeFileSync(path.join(work, "skills", name, "SKILL.md"), "# a skill\n");
  }

  const SKILLS = { triage: ["/first-skill", "/second-skill"] };

  reset("fine");
  const { agent } = await hostWith(["claude:sonnet"], { skills: SKILLS });
  await agent.triage(TICKET);

  record("relay.hands_the_step_to_the_skill_named_for_it", called()[0] === "claude:sonnet:first-skill");
  record("relay.asks_no_other_skill_once_one_answered", called().length === 1);

  reset("first-skill-fails");
  const second = await hostWith(["claude:sonnet"], { skills: SKILLS });
  await second.agent.triage(TICKET);

  record(
    "relay.moves_to_the_next_skill_when_the_first_did_not_answer",
    called().join(",") === "claude:sonnet:first-skill,claude:sonnet:second-skill",
  );

  const moved = second.events.filter((e) => e.kind === "agent.handoff");
  record("relay.records_the_skill_axis", moved[0]?.detail?.moved === "skill");

  const typo = await hostWith(["claude:sonnet"], { skills: { triage: ["/nao-existe"] } });
  const said = typo.outcome.ok === false ? typo.outcome.problems.join("\n") : "";

  record("relay.refuses_a_skill_nobody_installed_at_boot", typo.outcome.ok === false);
  record(
    "relay.names_the_skills_there_were_to_choose_from",
    said.includes("/first-skill") && said.includes("/second-skill"),
  );
}

const failed = assertions.filter((a) => a.status !== "passed");

fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "plugin-agent-relay",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "I am about to let this thing spend money on my behalf overnight. Prove the built artifact escalates the model on a failure, changes harness on a quota, refuses a ladder with a typo before boot finishes, never raises a fresh process after a run was cut off, stops starting work once the five hour window is nearly spent, and hands a step to the skill I named rather than to its own prompt.",
      artifact: {
        package: "@amykit/plugin-agent-relay",
        entry: "dist/index.js",
        mounted_with: ["@amykit/plugin-claude", "@amykit/plugin-codex", "@amykit/core"],
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        node: process.version,
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length > 0) {
  for (const a of failed) console.error(`FAILED ${a.type}`);
  process.exit(1);
}
PROBE
