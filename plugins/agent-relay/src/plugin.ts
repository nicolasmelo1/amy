import fs from "node:fs";
import path from "node:path";
import {
  Agent,
  AskContext,
  HarnessReply,
  CommandOutput,
  LogBudget,
  PluginCommand,
  definePlugin,
  PluginContext,
  Registry,
  deferred,
  hasACeiling,
  parseBudget,
  ConfigOf,
} from "@amykit/core";
import { MODELS_DEV_URL, ModelsDevCatalog, OVERRIDE_FILE, SpecTable, forgetSpecTable, refreshFrom, specTable } from "@amykit/model-specs";
import { HARNESS_COLLECTION, HarnessRelay, NamedHarness, Ladders, Rung, SkillLadders } from "@amykit/agent-kit";
import { configSchema } from "./config.js";

type TypedContext = PluginContext<ConfigOf<typeof configSchema>>;
import { inertCeilingProblems } from "./pricing.js";
import { DEFAULT_SKILL_ROOT, installedSkills, parseSkills, skillsNamed } from "./skills.js";

type Settings = ConfigOf<typeof configSchema>;

/**
 * What each model is believed to cost.
 *
 * Here rather than in the host because the price table is the business of the
 * one thing that spends an agent: a machine with no relay has nothing to
 * price, and a price list that came with the CLI was a fact about a package
 * rather than about this install.
 */
const models: PluginCommand<Settings> = {
  name: "models",
  description: "What each model is believed to cost",
  subcommands: [
    {
      name: "show",
      description: "The price table in force",
      default: true,
      run({ home, out }) {
        const table = specTable(home);
        out.line(`source: ${table.source}`);
        out.line();
        for (const spec of table.models) {
          const tier = spec.thresholdTokens
            ? `  (above ${spec.thresholdTokens.toLocaleString()} input tokens every rate changes)`
            : "";
          out.line(
            `  ${spec.model.padEnd(22)} in ${perMillion(spec.inputPerToken)}  ` +
              `out ${perMillion(spec.outputPerToken)}  ` +
              `cache r/w ${perMillion(spec.cacheReadPerToken)}/${perMillion(spec.cacheWritePerToken)}${tier}`,
          );
        }
        out.line();
        out.line(table.note);
      },
    },
    {
      name: "refresh",
      description: "Take the base rates from models.dev, keeping what it does not carry",
      flags: [
        { flags: "--dry-run", description: "say what would change and write nothing" },
        { flags: "--stale-after <days>", description: "refresh only a table written more than this many days ago" },
      ],
      async run({ home, options, out }) {
        const staleAfter = options.staleAfter === undefined ? undefined : Number(options.staleAfter);
        if (staleAfter !== undefined && !isStale(home, staleAfter)) {
          out.line(`the price table is younger than ${staleAfter} day(s); nothing to refresh`);
          return;
        }

        const table = await refreshed(home, out);
        if (!table || options.dryRun === true) return;

        const file = path.join(home, OVERRIDE_FILE);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`, "utf-8");
        forgetSpecTable();
        out.line(`\nwrote ${file}`);
        out.line("Long-context tiering was kept: models.dev does not publish it.");
      },
    },
  ],
};

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
async function refreshed(home: string, out: Pick<CommandOutput, "line" | "error">): Promise<SpecTable | undefined> {
  try {
    // Bounded, because this runs on a start and an update: a price list is
    // not worth holding a loop up for, and a machine with no route out must
    // come back to the table it already had rather than wait.
    const response = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      out.error(`${MODELS_DEV_URL} answered ${response.status}`);
      process.exitCode = 1;
      return undefined;
    }

    const report = refreshFrom((await response.json()) as ModelsDevCatalog, specTable(home));
    if (report.changed.length === 0) out.line("nothing changed");
    for (const change of report.changed) {
      out.line(`  ${change.model} ${change.field}: ${perMillion(change.was)} -> ${perMillion(change.now)}`);
    }
    for (const model of report.unmatched) {
      out.line(`  ${model}: models.dev does not know it, left as it was`);
    }
    return report.table;
  } catch (error) {
    out.error(`the price table was left as it was: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return undefined;
  }
}

/** Dollars per million tokens, which is how a price list is written. */
function perMillion(perToken: number | undefined): string {
  if (perToken === undefined) return "—";
  const dollars = perToken * 1_000_000;
  const decimals = Number.isInteger(dollars * 100) ? 2 : 4;
  return `$${dollars.toFixed(decimals)}`;
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-agent-relay",
  configSchema,
  commands: [models],
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

  const roots = ctx.config.skillRoots;
  const installed = installedSkills(roots.length > 0 ? roots : [DEFAULT_SKILL_ROOT]);

  const missing = skillsNamed(parsed.ladders).filter((skill) => !installed.includes(skill));
  if (missing.length > 0) {
    throw new Error(
      `skills name \`${missing.map((name) => `/${name}`).join(", ")}\`, which is not installed. ` +
        `Installed: ${installed.map((name) => `/${name}`).join(", ") || "nothing"}`,
    );
  }

  return parsed.ladders;
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
