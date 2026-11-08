import fs from "node:fs";
import path from "node:path";
import {
  Agent,
  AskContext,
  HarnessReply,
  LogBudget,
  defineOperation,
  definePlugin,
  fail,
  scopeOf,
  PluginContext,
  Registry,
  deferred,
  hasACeiling,
  parseBudget,
  ConfigOf,
} from "@amykit/core";
import { MODELS_DEV_URL, ModelsDevCatalog, OVERRIDE_FILE, RefreshReport, forgetSpecTable, refreshFrom, specTable } from "@amykit/model-specs";
import { HARNESS_COLLECTION, HarnessRelay, NamedHarness, Ladders, Rung, SkillLadders } from "@amykit/agent-kit";
import { z } from "zod";
import { configSchema } from "./config.js";

type TypedContext = PluginContext<ConfigOf<typeof configSchema>>;
import { inertCeilingProblems } from "./pricing.js";
import { DEFAULT_SKILL_ROOT, installedSkills, locateSkill, parseSkills, skillsNamed } from "./skills.js";


/** Dollars per million tokens, which is how a price list is written. */
const perMillion = (perToken: number): number => Math.round(perToken * 1_000_000 * 10_000) / 10_000;

/**
 * What each model is believed to cost, as this plugin's own operations:
 * `amy models` and `amy models refresh`.
 *
 * Here rather than in the host because the price table is the business of the
 * one thing that spends an agent: a machine with no relay has nothing to
 * price, and a price list that came with the CLI was a fact about a package
 * rather than about this install.
 */
const showPrices = defineOperation({
  id: "models.show-prices",
  domain: "models",
  summary: "The price table in force",
  description:
    "Reads the price table every agent call on this machine is priced from, in dollars per million tokens. " +
    "Above a model's threshold every rate changes. Changes nothing.",
  input: z.object({}),
  output: z.object({
    source: z.string().describe("source"),
    models: z.array(z.object({
      model: z.string().describe("model"),
      input: z.number().describe("in $/M"),
      output: z.number().describe("out $/M"),
      cacheRead: z.number().optional().describe("cache read $/M"),
      cacheWrite: z.number().optional().describe("cache write $/M"),
      threshold: z.number().int().optional().describe("rates change above, tokens"),
    })).describe("models"),
    note: z.string().describe("note"),
  }),
  writes: [],
  http: { method: "get", path: "/models/prices" },
  cli: { words: ["models", "show"], default: true },
  examples: [{
    summary: "one model",
    input: {},
    output: { source: "vendored", models: [{ model: "claude-sonnet-5-5", input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }], note: "prices are believed, not billed" },
  }],
  async handler(_input, context) {
    const { home } = scopeOf(context, "models.show-prices");
    const table = specTable(home);
    return {
      source: table.source,
      models: table.models.map((spec) => ({
        model: spec.model,
        input: perMillion(spec.inputPerToken),
        output: perMillion(spec.outputPerToken),
        ...(spec.cacheReadPerToken === undefined ? {} : { cacheRead: perMillion(spec.cacheReadPerToken) }),
        ...(spec.cacheWritePerToken === undefined ? {} : { cacheWrite: perMillion(spec.cacheWritePerToken) }),
        ...(spec.thresholdTokens ? { threshold: spec.thresholdTokens } : {}),
      })),
      note: table.note,
    };
  },
});

const refreshPrices = defineOperation({
  id: "models.refresh-prices",
  domain: "models",
  summary: "Take the base rates from models.dev, keeping what it does not carry",
  description:
    "Fetches models.dev and writes its base rates over this machine's price table, keeping long-context tiering, which models.dev does not publish. " +
    "A table younger than `staleAfter` days is left alone; a dry run writes nothing; a models.dev that cannot be reached leaves the table exactly as it was.",
  input: z.object({
    dryRun: z.boolean().default(false).describe("say what would change and write nothing"),
    staleAfter: z.number().optional().describe("refresh only a table written more than this many days ago"),
  }),
  output: z.object({
    outcome: z.enum(["written", "dry-run", "fresh"]).describe("outcome"),
    changes: z.array(z.object({
      model: z.string().describe("model"),
      field: z.string().describe("rate"),
      was: z.number().describe("was $/M"),
      now: z.number().describe("now $/M"),
    })).describe("changed"),
    unmatched: z.array(z.string()).describe("models.dev does not know"),
    file: z.string().optional().describe("wrote"),
  }),
  errors: { "models.unreachable": { description: "models.dev could not be reached or answered something unreadable; the table was left as it was" } },
  writes: ["price-table"],
  http: { method: "post", path: "/models/prices/refresh" },
  cli: { words: ["models", "refresh"] },
  examples: [{
    summary: "a table younger than a week",
    input: { staleAfter: 7 },
    output: { outcome: "fresh", changes: [], unmatched: [] },
  }],
  async handler({ dryRun, staleAfter }, context) {
    const { home } = scopeOf(context, "models.refresh-prices");
    if (staleAfter !== undefined && !isStale(home, staleAfter)) return { outcome: "fresh" as const, changes: [], unmatched: [] };

    const report = await refreshed(home);
    if ("reason" in report) return fail("models.unreachable", `the price table was left as it was: ${report.reason}`);
    const changes = report.changed.map((change) => ({ model: change.model, field: change.field, was: perMillion(change.was), now: perMillion(change.now) }));
    if (dryRun) return { outcome: "dry-run" as const, changes, unmatched: report.unmatched };

    const file = path.join(home, OVERRIDE_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report.table, null, 2)}\n`, "utf-8");
    forgetSpecTable();
    return { outcome: "written" as const, changes, unmatched: report.unmatched, file };
  },
});

/** Whether the table on this machine is older than a number of days. */
function isStale(home: string, days: number): boolean {
  try {
    return Date.now() - fs.statSync(path.join(home, OVERRIDE_FILE)).mtimeMs > days * 86_400_000;
  } catch {
    // No table written yet: the vendored one arrived with the release, and
    // there is no honest way to say when that was.
    return true;
  }
}

/**
 * Fetches and compares, and writes nothing.
 *
 * A refresh that cannot reach models.dev leaves the table exactly as it was:
 * the next agent call paying for yesterday's price is a smaller problem than
 * a table emptied because a network call failed.
 */
async function refreshed(home: string): Promise<RefreshReport | { reason: string }> {
  try {
    // Bounded, because this runs on a start and an update: a price list is
    // not worth holding a loop up for, and a machine with no route out must
    // come back to the table it already had rather than wait.
    const response = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { reason: `${MODELS_DEV_URL} answered ${response.status}` };
    return refreshFrom((await response.json()) as ModelsDevCatalog, specTable(home));
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-agent-relay",
  configSchema,
  operations: [showPrices, refreshPrices],
  register(registry, ctx) {
    // Deferred: the harnesses it relays to are contributed by plugins that
    // may be listed after this one. The host builds it once every plugin has
    // registered, so a ladder naming an agent nobody contributed is a typo
    // that costs a boot rather than somebody's ticket.
    //
    // The port is `ask` and nothing else. Every workflow's steps go up the
    // same ladder, into the same log and under the same ceiling, keyed by the
    // step each one names in its context.
    registry.port("agent", deferred(() => {
      const relay = build(ctx);
      const agent: Agent & { name: string } = {
        ask: (prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply> =>
          relay.ask(prompt, cwd, context),
        name: "relay",
      };
      return agent;
    }));
    mountBudget(registry, ctx);
  },
});

/**
 * Mounts the ceiling the engine asks before it starts anything expensive.
 *
 * It belongs to this plugin because this is the only thing in the system
 * that spends an agent, and it is only mounted when a ceiling was actually
 * configured: a budget that can never refuse is a port pretending to be one.
 */
function mountBudget(registry: Registry, ctx: TypedContext): void {
  const parsed = parseBudget(ctx.config.budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));

  if (!hasACeiling(parsed.limits)) return;

  if (!ctx.log) {
    throw new Error(
      "`budget` sets a ceiling, and the host mounted no event log to measure the spending against",
    );
  }

  registry.port("budget", new LogBudget(ctx.log, parsed.limits));
}

function build(ctx: TypedContext): HarnessRelay {
  const contributed = [...ctx.contributions(HARNESS_COLLECTION).values()] as NamedHarness[];
  const rungs = ladders(ctx, contributed);

  // Here rather than beside `mountBudget`, because this is the one question
  // that needs both halves in hand: what the ceiling is measured in, and
  // which models are underneath it. `register` has only the first.
  refuseAnInertCeiling(ctx, rungs);

  return new HarnessRelay(rungs, {
    log: ctx.log,
    now: ctx.now,
    skills: skillLadders(ctx),
    locate: (skill) => locateSkill(skillRootsOf(ctx), skill),
  });
}

/**
 * Refuses a ceiling in money over a ladder whose cost nobody could work out.
 *
 * The other half of the sentence `mountBudget` already says. That one refuses
 * a budget naming a window nobody meters; this one refuses a budget naming a
 * measure nobody can supply, which is the same failure — a ceiling that reads
 * like policy and is decoration — arrived at from the other side.
 */
function refuseAnInertCeiling(ctx: TypedContext, rungs: Ladders<NamedHarness>): void {
  const parsed = parseBudget(ctx.config.budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));

  const problems = inertCeilingProblems(parsed.limits, rungs);
  if (problems.length > 0) throw new Error(problems.join("; "));
}

/**
 * The ladders the config asked for: one fallback, and one per named step.
 *
 * Every name is resolved against what was contributed, including the ones
 * inside a step's ladder, so a typo in `ladderByStep` is refused at boot with
 * the same message a typo in `ladder` gets. A step ladder that quietly meant
 * less than it said would show up as one action mysteriously using the wrong
 * model, which is the hardest kind of thing to notice.
 */
function ladders<T extends Rung>(ctx: TypedContext, contributed: readonly T[]): Ladders<T> {
  const wanted = ctx.config.ladder;
  const fallback = wanted.length === 0 ? [...contributed] : order(contributed, wanted);

  const perStep = ctx.config.ladderByStep as Record<string, unknown>;
  const byStep: Record<string, readonly T[]> = {};

  for (const [step, names] of Object.entries(perStep)) {
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      throw new Error(`\`ladderByStep.${step}\` must be a list of contributed agent names`);
    }
    if (names.length === 0) continue;

    byStep[step] = order(contributed, names);
  }

  return { fallback, byStep };
}

/**
 * The skill ladders, with every name checked against what is installed.
 *
 * Refused at boot rather than skipped, for the same reason a ladder naming an
 * agent nobody contributed is refused: a config that quietly means less than
 * it says is worse than one that will not load.
 */
function skillLadders(ctx: TypedContext): SkillLadders {
  const parsed = parseSkills(ctx.config.skills);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));

  const installed = installedSkills(skillRootsOf(ctx));

  const missing = skillsNamed(parsed.ladders).filter((skill) => !installed.includes(skill));
  if (missing.length > 0) {
    throw new Error(
      `skills name \`${missing.map((name) => `/${name}`).join(", ")}\`, which is not installed. ` +
        `Installed: ${installed.map((name) => `/${name}`).join(", ") || "nothing"}`,
    );
  }

  return parsed.ladders;
}

/** Where installed skills are looked for: the configured roots, or the harness's own. */
function skillRootsOf(ctx: TypedContext): readonly string[] {
  const roots = ctx.config.skillRoots;
  return roots.length > 0 ? roots : [DEFAULT_SKILL_ROOT];
}

/**
 * The ladder the config asked for, in that order.
 *
 * A name nobody contributed is refused rather than skipped: a ladder with a
 * typo in it would quietly become shorter than the operator believes, and the
 * first symptom would be a ticket escalating for no reason.
 */
function order<T extends Rung>(contributed: readonly T[], wanted: readonly string[]): T[] {
  return wanted.map((name) => {
    const found = contributed.find((agent) => agent.name === name);
    if (!found) {
      throw new Error(
        `the ladder names \`${name}\`, which no harness contributed. ` +
          `Contributed: ${contributed.map((a) => a.name).join(", ") || "nothing"}`,
      );
    }
    return found;
  });
}
