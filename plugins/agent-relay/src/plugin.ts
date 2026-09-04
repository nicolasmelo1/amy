import {
  AskContext,
  HarnessReply,
  LogBudget,
  Plugin,
  PluginContext,
  Registry,
  ReviewThread,
  hasACeiling,
  parseBudget,
} from "@amy/core";
import {
  AGENT_COLLECTION,
  HARNESS_COLLECTION,
  HarnessRelay,
  NamedAgent,
  NamedHarness,
  Rung,
  SkillLadders,
} from "@amy/agent-kit";
import {
  Agent,
  AttemptOutcome,
  ThreadVerdict,
  Ticket,
  TriageOutcome,
} from "@amy/workflow-ticket-to-qa";
import { AgentResult } from "@amy/core";
import { AgentRelay } from "./AgentRelay.js";
import { configSchema } from "./config.js";
import { DEFAULT_SKILL_ROOT, installedSkills, parseSkills, skillsNamed } from "./skills.js";

/**
 * The relay built for one mount, keyed by that mount's context.
 *
 * The exported `plugin` is a module singleton, so a field on it would be
 * shared by every host in the process and the second mount would answer with
 * the first one's ladder. The context is per mount, which makes it the right
 * key.
 */
const relays = new WeakMap<PluginContext, AgentRelay>();
const harnesses = new WeakMap<PluginContext, HarnessRelay>();

function relayFor(ctx: PluginContext): AgentRelay {
  const existing = relays.get(ctx);
  if (existing) return existing;

  const relay = build(ctx);
  relays.set(ctx, relay);
  return relay;
}

function harnessFor(ctx: PluginContext): HarnessRelay {
  const existing = harnesses.get(ctx);
  if (existing) return existing;

  const built = buildHarness(ctx);
  harnesses.set(ctx, built);
  return built;
}

export const plugin: Plugin = {
  name: "@amy/plugin-agent-relay",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    // Not built now: the harnesses it relays to are contributed by plugins
    // that may be listed after this one, and mounting order should not be
    // something an operator has to get right. `ready` builds it as soon as
    // they have all registered, and this is the fallback for a host that
    // mounts without that second pass.
    const lazily = (): AgentRelay => relayFor(ctx);

    const facade: Agent = {
      triage: (ticket: Ticket): Promise<AgentResult<TriageOutcome>> => lazily().triage(ticket),

      implement: (ticket: Ticket, retryContext?: string): Promise<AgentResult<AttemptOutcome>> =>
        lazily().implement(ticket, retryContext),

      addressThreads: (
        ticket: Ticket,
        threads: readonly ReviewThread[],
        from: "automated" | "human",
      ): Promise<AgentResult<ThreadVerdict[]>> =>
        lazily().addressThreads(ticket, threads, from),
    };

    // One port, two levels of the same thing. The ticket-shaped half is what
    // `triage` and `implement` reach; `ask` is the half with no vocabulary in
    // it, which is how a second workflow's own prompts end up on the same
    // ladder, in the same log and under the same ceiling as the first
    // workflow's. Neither workflow has to know the other exists.
    registry.port("agent", {
      ...facade,
      ask: (prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply> =>
        harnessFor(ctx).ask(prompt, cwd, context),
      name: "relay",
    });
    mountBudget(registry, ctx);
  },

  /**
   * Builds the relay while boot can still refuse.
   *
   * A ladder naming an agent nobody contributed is a typo, and the whole
   * point of validating at mount is that a typo costs a boot rather than
   * somebody's ticket.
   */
  ready(ctx) {
    relayFor(ctx);
  },
};

/**
 * Mounts the ceiling the engine asks before it starts anything expensive.
 *
 * It belongs to this plugin because this is the only thing in the system
 * that spends an agent, and it is only mounted when a ceiling was actually
 * configured: a budget that can never refuse is a port pretending to be one.
 */
function mountBudget(registry: Registry, ctx: PluginContext): void {
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

function build(ctx: PluginContext): AgentRelay {
  const contributed = [...ctx.contributions(AGENT_COLLECTION).values()] as NamedAgent[];

  return new AgentRelay(rungs(ctx, contributed), {
    log: ctx.log,
    now: ctx.now,
    skills: skillLadders(ctx),
  });
}

/**
 * The same ladder, one level down.
 *
 * Built from its own collection rather than by unwrapping the agents, because
 * the two are contributed together by the same plugin and reading the one you
 * mean is cheaper to follow than reaching through the other.
 */
function buildHarness(ctx: PluginContext): HarnessRelay {
  const contributed = [...ctx.contributions(HARNESS_COLLECTION).values()] as NamedHarness[];

  return new HarnessRelay(rungs(ctx, contributed), {
    log: ctx.log,
    now: ctx.now,
    skills: skillLadders(ctx),
  });
}

/** What the config asked for, in that order, or everything contributed. */
function rungs<T extends Rung>(ctx: PluginContext, contributed: readonly T[]): T[] {
  const wanted = ctx.config.ladder as string[];
  return wanted.length === 0 ? [...contributed] : order(contributed, wanted);
}

/**
 * The skill ladders, with every name checked against what is installed.
 *
 * Refused at boot rather than skipped, for the same reason a ladder naming an
 * agent nobody contributed is refused: a config that quietly means less than
 * it says is worse than one that will not load.
 */
function skillLadders(ctx: PluginContext): SkillLadders {
  const parsed = parseSkills(ctx.config.skills);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));

  const roots = ctx.config.skillRoots as string[];
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
