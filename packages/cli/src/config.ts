import fs from "node:fs";
import yaml from "yaml";
import { DEFAULT_POLICY, Policy } from "@amy/workflow-ticket-to-qa";
import { DEFAULT_POLICY as DEFAULT_PLAN_POLICY, Policy as PlanPolicy } from "@amy/workflow-note-to-plan";
import { Roster } from "@amy/workflow-ticket-to-qa";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths.js";

/**
 * The second workflow's vocabulary: friction written down becomes a plan.
 *
 * Deliberately its own block rather than reusing `repos` and `gate`. The
 * repositories a plan may be written into are the ones this work lives in,
 * which is a different list from the ones the team's tickets land in, and the
 * check that judges a plan is `sf check` rather than the implementation gate.
 */
interface PlansConfig {
  /**
   * The repositories a plan may be written into. The first is what a note
   * that does not name one is filed against, which is usually this machine.
   */
  repos: string[];
  /** The check per repository, with a `default` fallback. */
  check: Record<string, string[]>;
  policy: Partial<PlanPolicy>;
  /** Empty means the built-in set for this profile. */
  pluginList: string[];
}

interface NotifyConfig {
  /** Comment on the ticket itself. */
  tracker: boolean;
  /** A Hermes delivery target, e.g. `telegram`. Null disables the channel. */
  hermes: string | null;
  /** A file on disk plus a desktop notification. */
  inbox: boolean;
}

export interface AmyConfig {
  repos: string[];
  qaStatusName: string;
  /** The tracker status a ticket must be in to be picked up. */
  workingStatusName: string;
  retentionDays: number;
  staleClaimMs: number;
  maxItemAttempts: number;
  policy: Policy;

  /** Directory holding one checkout per repository. `~` is expanded. */
  workspaceRoot: string;
  /** Branch new work is cut from. */
  defaultBranch: string;
  /** Which repository a team's tickets land in, by team key. */
  repoByTeam: Record<string, string>;
  /** Gate commands per repository, with a `default` fallback. */
  gate: Record<string, string[]>;
  agent: {
    model?: string;
    /** Model tiers offered to the relay, cheapest first. */
    models?: string[];
    /**
     * Which contributed agents to try, in order, such as
     * `[claude:sonnet, claude:opus, codex:gpt-5]`. Empty means every agent
     * that was contributed, in mounting order.
     *
     * Naming a harness here is also what mounts it, so a ladder is the one
     * place an operator says which harnesses they have.
     */
    ladder?: string[];
    reviewerHints?: Record<string, string>;
    timeoutMs?: number;
    /**
     * What the agents may spend, per window. Read by the relay, which is the
     * only thing here that spends one. Shape checked at boot, not here.
     */
    budget?: Record<string, unknown>;
  };
  /**
   * Which skills answer for a step, in the order they are tried, keyed by the
   * workflow's action name. A skill named here has to be installed.
   */
  skills: Record<string, string[]>;
  notify: NotifyConfig;
  plans: PlansConfig;
  /**
   * The plugins to mount, in order. Empty means the built-in set.
   */
  pluginList: string[];
  /**
   * One slice per plugin, keyed by package name.
   *
   * The host never reads inside a slice. Each plugin declares what its own
   * looks like, and `amy doctor` refuses a slice that does not match.
   */
  plugins: Record<string, unknown>;
}

export const DEFAULT_CONFIG: AmyConfig = {
  repos: [],
  qaStatusName: "In QA",
  workingStatusName: "In Progress",
  retentionDays: 7,
  staleClaimMs: 30 * 60 * 1000,
  maxItemAttempts: 5,
  policy: DEFAULT_POLICY,
  workspaceRoot: ".",
  defaultBranch: "main",
  repoByTeam: {},
  gate: {},
  agent: {},
  skills: {},
  notify: { tracker: true, hermes: null, inbox: true },
  plans: { repos: [], check: { default: ["sf check"] }, policy: {}, pluginList: [] },
  pluginList: [],
  plugins: {},
};

/** `~/workspaces/northwind` becomes an absolute path. */
function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function loadConfig(root: string): AmyConfig {
  const file = paths(root).config;
  if (!fs.existsSync(file)) {
    return DEFAULT_CONFIG;
  }

  const parsed = (yaml.parse(fs.readFileSync(file, "utf-8")) ?? {}) as Partial<AmyConfig>;

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    policy: { ...DEFAULT_POLICY, ...(parsed.policy ?? {}) },
    notify: { ...DEFAULT_CONFIG.notify, ...(parsed.notify ?? {}) },
    skills: parsed.skills ?? {},
    pluginList: parsed.pluginList ?? [],
    plugins: parsed.plugins ?? {},
    agent: { ...DEFAULT_CONFIG.agent, ...(parsed.agent ?? {}) },
    plans: {
      ...DEFAULT_CONFIG.plans,
      ...(parsed.plans ?? {}),
      policy: { ...DEFAULT_PLAN_POLICY, ...(parsed.plans?.policy ?? {}) },
    },
    workspaceRoot: expandHome(parsed.workspaceRoot ?? DEFAULT_CONFIG.workspaceRoot),
  };
}

export function loadRoster(root: string): Roster {
  const file = paths(root).roster;
  if (!fs.existsSync(file)) {
    throw new Error(`no roster at ${file}, run \`amy init\` first`);
  }

  const parsed = yaml.parse(fs.readFileSync(file, "utf-8")) as Partial<Roster>;

  if (!parsed?.confirmedOn || !parsed.reviewers?.length || !parsed.qa) {
    throw new Error(`${file} needs confirmedOn, reviewers and qa`);
  }

  return parsed as Roster;
}

/**
 * Stamps the roster with today's date.
 *
 * Deliberately a separate action from editing the roster, so confirming that
 * nothing changed is one command rather than a file edit somebody skips.
 */
export function confirmRoster(root: string, today: Date): Roster {
  const file = paths(root).roster;
  const roster = loadRoster(root);
  const confirmed: Roster = { ...roster, confirmedOn: today.toISOString().slice(0, 10) };
  fs.writeFileSync(file, yaml.stringify(confirmed), "utf-8");
  return confirmed;
}

export const EXAMPLE_ROSTER = `# Who is reviewing today, and who owns QA.
#
# confirmedOn is checked against today's date on every workday. The machine
# refuses to assign anybody while it is stale, because people go on leave
# without editing a config file and a review assigned to someone who is away
# stalls for days without anything looking broken.
#
# Confirm it with: amy roster confirm
confirmedOn: "1970-01-01"

reviewers:
  - tracker: ada@example.test
    host: ada
    available: true
  - tracker: alan@example.test
    host: alan
    available: true
  - tracker: edsger@example.test
    host: edsger
    available: true

qa:
  tracker: grace@example.test
  host: grace
  available: true
`;

export const EXAMPLE_CONFIG = `# Repositories the team reviews in. Review load is counted across all of
# them, because counting one would send every review to whoever happens to be
# quiet in that one.
repos:
  - Northwind/northwind-backend
  - Northwind/northwind-frontend

# Tracker status names, matched exactly. Not categories: the tracker files
# In Review, In QA and Ready To Release under the same category as
# In Progress, so a category match picks up work that is already past
# implementation.
workingStatusName: In Progress
qaStatusName: In QA

# Finished queue items are only useful for reading the log afterwards.
retentionDays: 7

# How the machine behaves when something is in its way. Anything left out
# keeps its default. maxOpenReviewsPerReviewer is the one that spends a
# currency nobody can top up: past it, the pull request stays open with
# nobody assigned rather than landing on somebody already buried.
policy:
  maxOpenReviewsPerReviewer: 2

# Where the checkouts live. One directory per repository, named after the
# repository without its owner.
workspaceRoot: ~/workspaces/northwind
defaultBranch: main

# Which repository a team's tickets land in, by team key. A team that is not
# listed falls back to the first entry in "repos".
repoByTeam:
  PROJ: Northwind/northwind-backend
  WEB: Northwind/northwind-backend

# The deterministic gate. Nothing reaches a pull request until this is green.
# A repository with no entry here, and no "default", is refused rather than
# waved through.
gate:
  Northwind/northwind-backend:
    - npm run --workspace @northwind/api lint
    - npm run --workspace @northwind/api typecheck

agent:
  # Long flag: the claude CLI does not accept -m.
  model: sonnet
  # What the agents may spend. Two ceilings per window and the first one to
  # blow parks the work: tokens are what a subscription meters, dollars are
  # what an API key costs. A run whose cost nobody reported moves the token
  # ceiling and not the dollar one. Leave the whole block out for no ceiling.
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek: { tokens: 30000000, costUsd: 150 }
    # The fraction of a ceiling at which new work stops being started.
    stopAt: 0.9
  # The order the relay tries. A failure moves to the next model of the same
  # harness and then to the next harness; a rate limit skips the rest of that
  # harness, because a bigger model behind the same quota is still blocked.
  # Naming a harness here is what mounts it, so leaving codex and hermes out
  # means they are never required to be installed.
  # ladder: [claude:sonnet, claude:opus, codex:gpt-5]
  # Guidance appended when answering a particular reviewer, by host login.
  # A reviewer with known habits is cheaper to satisfy on the first pass.
  reviewerHints:
    edsger: >-
      Delete anything that is not needed. No variable that aliases an existing
      value, no check the types already guarantee, no comment stating the
      obvious, no non-null assertions.

# Who does each step. A step with no entry is done by the agent in amy's own
# words, which is every step until you say otherwise. A skill named here must
# be installed under ~/.claude/skills, or the mount is refused at boot: a
# ladder that quietly means less than it says would first show up as a ticket
# escalating for no reason.
#
# The skills are tried in order, and each one is tried across the harness
# ladder above before the next gets a turn. Only the three steps an agent
# performs can be handed over: triage, implement, address-threads.
# skills:
#   address-threads: [/northwind-code-review, /logion]
#   triage: [/logion]

# Where the machine reaches you. It needs at least one of these.
notify:
  tracker: true      # comment on the ticket
  hermes: slack:my-channel   # a Hermes delivery target, or null
  inbox: true        # a file in .amy/needs-input plus a desktop notification

# One slice per plugin, keyed by package name. Nothing here is read by the
# host: each plugin declares what its own slice looks like, and "amy doctor"
# refuses a field that is not one the plugin has. A plugin with no slice runs
# on its defaults.
plugins:
  "@amy/plugin-notify-hermes":
    target: slack:my-channel
  "@amy/plugin-file-queue":
    retentionDays: 7
`;

/**
 * Rewrites just the plugin list, leaving every other line as it was.
 *
 * Rewriting the whole file from the parsed object would drop the comments
 * that explain what each setting is for, which is most of the file's value.
 */
export function writePluginList(root: string, specs: readonly string[]): void {
  const file = paths(root).config;
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const block = `pluginList:\n${specs.map((spec) => `  - "${spec}"`).join("\n")}\n`;

  const without = withoutPluginList(existing);
  const trimmed = without.replace(/\n{3,}$/, "\n\n");

  fs.mkdirSync(paths(root).base, { recursive: true });
  fs.writeFileSync(file, `${trimmed.replace(/\n*$/, "\n")}\n${block}`, "utf-8");
}

/**
 * The file without its `pluginList:` block, list items included.
 *
 * A line walk rather than one multi-line pattern: a quantifier over indented
 * lines nested inside another is the shape that backtracks forever, and a
 * config file is not worth a regular expression nobody can reason about.
 */
function withoutPluginList(text: string): string {
  const kept: string[] = [];
  let inside = false;

  for (const line of text.split("\n")) {
    if (inside && /^[ \t]+- /.test(line)) continue;
    inside = line.startsWith("pluginList:");
    if (!inside) kept.push(line);
  }

  return kept.join("\n");
}
