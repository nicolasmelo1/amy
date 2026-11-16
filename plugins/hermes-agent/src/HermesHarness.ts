import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentOutcome, AgentRun, AskContext, CommandResult, CommandRunner, Harness, HarnessReply, TokenUsage } from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";
import { externalDirsIn } from "./profile.js";

export interface HermesHarnessConfig {
  model?: string;
  timeoutMs?: number;
  /**
   * The profile the run is in. Without one, `-z` runs in the operator's own
   * Hermes: their memory read into the run, and whatever it learns written
   * back, with approvals bypassed.
   */
  profile?: string;
}

/** The report `--usage-file` writes, which it writes even on a failed run. */
export interface HermesUsage {
  estimated_cost_usd?: number;
  cost_status?: string;
  cost_source?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  model?: string;
  provider?: string;
  completed?: boolean;
  failed?: boolean;
  failure_reason?: string;
  failure_resets_at?: string;
}

/**
 * Where a Hermes profile keeps its skills.
 *
 * A named profile has its own `skills` directory, cloned from the active one,
 * so that is the set the run reads. Without a profile the operator's own
 * `~/.hermes/skills` is the one, which is exactly the setup `-p` exists to
 * avoid.
 */
export function skillsRoot(profile: string | undefined, hermesHome = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes")): string {
  return profile ? path.join(hermesHome, "profiles", profile, "skills") : path.join(hermesHome, "skills");
}

/**
 * Hermes, over its one-shot mode.
 *
 * `-z` prints only the final response, and `--usage-file` writes the account
 * beside it. The account is written **even when the run fails**, which is the
 * nicest property of the three harnesses: a failed run still says what it
 * spent, so nothing is silently free.
 */
export class HermesHarness implements Harness {
  readonly name = "hermes";
  /** It is handed a skill by name: `-s`, resolved through the profile. */
  readonly lendsSkill = true;
  /** The skills the profile amy runs in reads. */
  readonly skillsDirectory: string;
  private readonly hermesHome: string;

  constructor(
    private readonly runner: CommandRunner,
    private readonly config: HermesHarnessConfig = {},
    private readonly tmpDir: string = os.tmpdir(),
  ) {
    this.hermesHome = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
    this.skillsDirectory = skillsRoot(config.profile, this.hermesHome);
  }

  async ask(prompt: string, cwd: string, context: AskContext = {}): Promise<HarnessReply> {
    // `-z` has no mode that keeps the agent's tools off the checkout, so a run
    // that must change nothing is refused before it starts, and a relay hands
    // it to a harness that can enforce it.
    if (context.readOnly) {
      return this.refused("hermes -z cannot run without write access to the checkout, so it does not take a read-only step");
    }
    const profileArgs = this.config.profile ? ["-p", this.config.profile] : [];
    // `-s` resolves the name through the profile's roots. If a local copy in a
    // higher tier would answer instead, or the lent directory is in no root the
    // profile reads, the turn is refused before it runs: `-s` would load the
    // wrong skill, or none, and the run would look like work.
    const refuses = context.skill ? await this.refusal(context.skill, profileArgs) : undefined;
    if (refuses) return this.refused(refuses);
    const report = path.join(this.tmpDir, `amy-hermes-${process.pid}-${Date.now()}.json`);
    const args = [...profileArgs];
    // The skill the prompt is addressed to, by name: the profile's
    // `external_dirs` is where Hermes finds amy's root, and `-s` is which
    // skill in it this turn must load.
    if (context.skill) args.push("-s", context.skill.name);
    args.push("-z", prompt, "--usage-file", report);
    if (this.config.model) {
      args.push("-m", this.config.model);
    }

    const started = Date.now();
    const result = await this.runner.run("hermes", args, {
      cwd,
      timeoutMs: this.config.timeoutMs,
    });

    const usage = readUsage(report);
    fs.rmSync(report, { force: true });
    return this.answer(result, usage, started, context.skill);
  }

  /** A turn refused before it ran, which spends nothing and says why. */
  private refused(output: string): HarnessReply {
    return {
      text: "",
      run: { outcome: "failed", harness: this.name, model: this.config.model ?? "", durationMs: 0, costSource: "unknown", output },
    };
  }

  /** What the run was, with `unknown_skill` made visible in its own words. */
  private answer(
    result: CommandResult,
    usage: HermesUsage | undefined,
    started: number,
    skill: { readonly name: string } | undefined,
  ): HarnessReply {
    const tokens = tokensOf(usage);
    const model = usage?.model ?? this.config.model ?? "";
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    // Hermes exits 1 with `unknown_skill` when `-s` names nothing it resolves;
    // the exit code alone cannot say that, and the report is absent, so this is
    // the one failure the run's own words have to name.
    const unknown = Boolean(skill && /unknown_skill/.test(output));
    const retry = retryAfterMs(usage);
    return {
      text: result.stdout,
      run: {
        outcome: unknown ? "failed" : classify(usage, result.ok),
        harness: this.name,
        model,
        tokens,
        ...cost(usage, tokens, model),
        durationMs: Date.now() - started,
        ...(retry === undefined ? {} : { retryAfterMs: retry }),
        output: unknown
          ? `${skill!.name}: hermes reported unknown_skill, so the profile cannot see the lent skill; run \`amy skills\` to see what it can lend\n${output}`
          : output,
      } satisfies AgentRun,
    };
  }

  /**
   * Why the profile would not load the lent skill, or undefined when it will.
   *
   * Hermes resolves `-s` by tier: the project, then the profile's own `skills`,
   * then `skills.external_dirs`. A profile created with `--clone` carries the
   * operator's skills into the middle tier, where a same-named copy wins over
   * amy's root; and a directory no tier names is never found at all. Both are
   * refused here, before `-z` starts.
   */
  private async refusal(skill: { readonly name: string; readonly path: string }, profileArgs: readonly string[]): Promise<string | undefined> {
    const file = path.join(path.resolve(skill.path), "SKILL.md");
    if (!fs.existsSync(file)) {
      return `/${skill.name} cannot be lent to hermes: ${file} does not exist, so the turn would run without the skill`;
    }
    if (!this.config.profile) return undefined;

    const local = path.join(this.hermesHome, "profiles", this.config.profile, "skills", skill.name, "SKILL.md");
    if (fs.existsSync(local)) {
      return `/${skill.name} would be loaded from the profile's own copy at ${local}, not the lent ${skill.path}; remove it or let amy lend that copy`;
    }

    const configured = await this.runner.run("hermes", [...profileArgs, "config", "get", "skills.external_dirs"]);
    const roots = configured.ok ? externalDirsIn(configured.stdout) : [];
    const lent = realpath(path.resolve(skill.path));
    const named = roots.some((root) => {
      const candidate = path.join(root, skill.name);
      return fs.existsSync(candidate) && realpath(candidate) === lent;
    });
    if (!named) {
      return `/${skill.name} cannot be lent to hermes: ${skill.path} is not in any root the profile reads (${roots.length ? roots.join(", ") : "skills.external_dirs names none"})`;
    }
    return undefined;
  }
}

/** The canonical path, so a link and its target are the same skill. */
function realpath(at: string): string {
  return fs.realpathSync(at);
}

export function readUsage(file: string): HermesUsage | undefined {
  if (!fs.existsSync(file)) return undefined;

  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as HermesUsage;
  } catch {
    return undefined;
  }
}

/**
 * The token counts.
 *
 * `input_tokens` here **excludes** what was served from cache: the report's
 * own `total_tokens` is the sum of input, output and cache reads. That is the
 * opposite of the convention codex uses for a field of the same name, so
 * neither can borrow the other's mapping.
 */
export function tokensOf(usage: HermesUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;

  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_tokens ?? 0,
    cacheWrite: usage.cache_write_tokens ?? 0,
  };
}

/**
 * What it cost, and how that is known.
 *
 * `cost_status: "included"` means a subscription covered the run, so zero is
 * the right answer rather than a missing one. Anything else Hermes puts in
 * `estimated_cost_usd` is, by its own word, an estimate from a price table,
 * so it is recorded as `computed` rather than `reported`: presenting somebody
 * else's estimate as a measurement is exactly what `costSource` exists to
 * stop.
 */
export function cost(
  usage: HermesUsage | undefined,
  tokens: TokenUsage | undefined,
  model: string,
): { costUsd?: number; costSource: AgentRun["costSource"] } {
  if (usage?.cost_status === "included") {
    return { costUsd: 0, costSource: "included" };
  }

  if (typeof usage?.estimated_cost_usd === "number" && usage.estimated_cost_usd > 0) {
    return { costUsd: usage.estimated_cost_usd, costSource: "computed" };
  }

  if (tokens) {
    const spec = specFor(model);
    if (spec) return { costUsd: costOf(spec, tokens), costSource: "computed" };
  }

  return { costSource: "unknown" };
}

/**
 * Which outcome this was.
 *
 * The report says plainly whether the run completed or failed, which beats
 * an exit code. Hermes publishes no quota status, so a rate limit reads as
 * `failed` rather than `rate-limited`.
 */
export function classify(usage: HermesUsage | undefined, exitOk: boolean): AgentOutcome {
  if (!usage) return exitOk ? "completed" : "abandoned";
  if (usage.failure_reason === "rate_limit") return "rate-limited";
  if (usage.failed === true) return "failed";
  if (usage.completed === true) return "completed";
  return exitOk ? "completed" : "failed";
}

/** Provider reset timestamps are optional; absent keeps the workflow fallback. */
export function retryAfterMs(usage: HermesUsage | undefined, now = Date.now()): number | undefined {
  if (usage?.failure_reason !== "rate_limit" || !usage.failure_resets_at) return undefined;
  const at = Date.parse(usage.failure_resets_at);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}
