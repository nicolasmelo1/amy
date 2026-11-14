import fs from "node:fs";
import yaml from "yaml";
import path from "node:path";
import { ConfigSchema } from "@amykit/core";
import { paths, profileConfig } from "./paths.js";

/**
 * The workflow's own settings, checked against its configSchema at mount.
 *
 * This is what `amy add <workflow>` writes when the schema asks for a setting
 * nothing else fills in: one entry per required field that carries an
 * `example`, the value the plugin itself says it would mount with.
 */
export type ProfileSettings = Record<string, unknown>;

/**
 * One profile: which workflow drives, and what mounts under it.
 *
 * This is what makes `--workflow oncall` a thing an operator can add rather
 * than a thing this package has to ship. The name is the key, and it is also
 * the directory the profile's records and queue live in.
 */
export interface WorkflowProfile {
  /** The package contributing `plan()` and the runtime that answers it. */
  workflow: string;
  /** What to mount, in order. Empty means the recommended set. */
  plugins?: string[];
  /**
   * The package providing durable briefs for this workflow. When omitted,
   * legacy explicit profiles that still name file-store receive the local
   * file provider they had before briefs became their own mount.
   */
  briefStore?: string;
  /** Whether `amy note` files friction onto this profile's queue. */
  notes?: boolean;
  /** Whether `amy btw` puts a task onto this profile's queue. */
  tasks?: boolean;
  /** A profile may spend differently from the machine-wide default. */
  agent?: Partial<AmyConfig["agent"]>;
  /**
   * The workflow's own settings, over what its schema and the machine fill in.
   *
   * Whichever workflow the profile drives owns this block; a setting a
   * workflow's schema does not declare is refused at mount, naming the key.
   */
  settings?: ProfileSettings;
}

interface NotifyConfig {
  /** A Hermes delivery target, e.g. `telegram`. Null disables the channel. */
  hermes: string | null;
  /** A file on disk plus a desktop notification. */
  inbox: boolean;
}

/** When the machine refreshes its installed packages around workflow work. */
interface AutoUpdateConfig {
  enabled: boolean;
  timing: "before" | "after";
  everyRuns: number;
}

const DEFAULT_AUTO_UPDATE: AutoUpdateConfig = {
  enabled: true,
  timing: "before",
  everyRuns: 20,
};

/** The host-owned schedule is checked before any workflow is allowed to run. */
function autoUpdateProblems(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["`autoUpdate` must be a mapping"];
  }
  const schedule = value as Partial<AutoUpdateConfig>;
  const problems: string[] = [];
  if (typeof schedule.enabled !== "boolean") problems.push("`autoUpdate.enabled` must be true or false");
  if (schedule.timing !== "before" && schedule.timing !== "after") {
    problems.push("`autoUpdate.timing` must be `before` or `after`");
  }
  if (!Number.isSafeInteger(schedule.everyRuns) || (schedule.everyRuns ?? 0) <= 0) {
    problems.push("`autoUpdate.everyRuns` must be a positive integer");
  }
  return problems;
}

/** Validates the words the operator wrote, before the safe runtime defaults. */
/** What is wrong with the `chat` block, read as written: a budget flag that is not a boolean is refused, never guessed. */
export function configuredChatProblems(config: AmyConfig): string[] {
  const chat = config.chatSource;
  if (chat === undefined) return [];
  if (typeof chat !== "object" || chat === null || Array.isArray(chat)) return ["`chat` must be a mapping"];
  const budget = (chat as Record<string, unknown>).budget;
  return budget === undefined || typeof budget === "boolean" ? [] : ["`chat.budget` must be true or false"];
}

export function configuredAutoUpdateProblems(config: AmyConfig): string[] {
  return autoUpdateProblems(config.autoUpdateSource === undefined ? config.autoUpdate : config.autoUpdateSource);
}

/**
 * The skills the chat may start with: the `skills` ladder's `chat` step, and
 * nothing else.
 *
 * The relay checks the same ladder at boot, so a name here is a name that
 * mounted; this read is for the chat, which asks for a skill by name and needs
 * to know which ones a message may be answered with.
 */
export function chatSkills(config: AmyConfig): string[] {
  // The operator's own slice wins every field it wrote, exactly as mounting
  // reads it: a ladder written under the relay's settings is the effective
  // one, and the top-level `skills` is only the default it replaces.
  const given = config.plugins["@amykit/plugin-agent-relay"] as { skills?: unknown } | undefined;
  const ladder = isRecord(given?.skills) ? given.skills : config.skills;
  const chat = ladder.chat;
  if (!Array.isArray(chat)) return [];
  return chat.filter((name) => typeof name === "string").map((name) => name.replace(/^\//, ""));
}

/**
 * Which harnesses' own skills are linked into amy's root, by the name of the
 * harness's plugin, as mounting reads it: the relay's own slice wins over the
 * top-level setting. The relay checks the names against the harnesses that
 * mounted, so what is read here already booted.
 */
export function harnessSkills(config: AmyConfig): unknown {
  const given = config.plugins["@amykit/plugin-agent-relay"] as { harnessSkills?: unknown } | undefined;
  return given?.harnessSkills !== undefined ? given.harnessSkills : config.harnessSkills;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The skill roots the relay was given, when the machine's config names any. */
export function configuredSkillRoots(config: AmyConfig): string[] {
  const held = config.plugins["@amykit/plugin-agent-relay"] as { skillRoots?: unknown } | undefined;
  return Array.isArray(held?.skillRoots) ? held.skillRoots.filter((one): one is string => typeof one === "string") : [];
}

export interface AmyConfig {
  /**
   * The workflows this install can drive, by the name typed after
   * `--workflow`. Merged over the shipped two, so naming one replaces it and
   * naming a third adds it.
   */
  workflows: Record<string, WorkflowProfile>;
  /** Which profile runs when nothing is named. Empty means the first. */
  defaultWorkflow: string;
  /**
   * Plugins mounted under every profile, named here or added with
   * `amy add`. A workflow's own plugins stay in its profile; this is the
   * list for what somebody mounted on top, and it is kept apart so a
   * profile left on the recommended set stays on it.
   */
  extraPlugins: string[];
  /**
   * What `amy add <package>` does with no flag: install the published package
   * (`package`), or take its source as a fork the profile owns (`fork`).
   * Read as written, so a mode amy does not know is refused naming this key.
   */
  add: unknown;
  /**
   * Where forks go when `--to` names no place; empty means the default — the
   * project of a workflow of your own, or the profile's directory in AMY_HOME.
   */
  forks: string;
  /** One machine-wide cadence, persisted separately for every profile. */
  autoUpdate: AutoUpdateConfig;
  /** A scalar/null source value retained so malformed YAML cannot become valid. */
  autoUpdateSource?: unknown;

  /**
   * The chat amy answers in. A conversation is not work: unless `budget` is
   * on, its agent runs are held to no ceiling and kept out of the ledger the
   * work is admitted against.
   */
  chat: { budget: boolean };
  /** The `chat` block as written, kept so a malformed one is refused rather than defaulted. */
  chatSource?: unknown;

  retentionDays: number;
  staleClaimMs: number;
  maxItemAttempts: number;
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
    /**
     * A ladder for one step, keyed by the workflow's action name, overriding
     * the one above.
     *
     * Reading a ticket to decide whether it is clear enough to start is not
     * the same job as writing the change, and one list for both means paying
     * the expensive model to do the cheap step. A name here mounts its
     * harness exactly as a name in `ladder` does.
     */
    ladderByStep?: Record<string, string[]>;
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
  /**
   * Which harnesses' own installed skills amy links into its skill root, by
   * the name of the harness's plugin: `{ claude: true }`. Linked at each run
   * and tick; `false`, or left out, removes the links.
   */
  harnessSkills: Record<string, unknown>;
  notify: NotifyConfig;
  /**
   * One slice per plugin, keyed by package name.
   *
   * The host never reads inside a slice. Each plugin declares what its own
   * looks like, and `amy doctor` refuses a slice that does not match.
   */
  plugins: Record<string, unknown>;
}

export const DEFAULT_CONFIG: AmyConfig = {
  workflows: {},
  defaultWorkflow: "",
  extraPlugins: [],
  add: "package",
  forks: "",
  autoUpdate: DEFAULT_AUTO_UPDATE,
  chat: { budget: false },
  retentionDays: 7,
  staleClaimMs: 30 * 60 * 1000,
  maxItemAttempts: 5,
  agent: {},
  skills: {},
  harnessSkills: {},
  // A tracker comment is for a question that needs a person, and the workflow
  // posts those itself — announcements are the operator's channels' job.
  notify: { hermes: null, inbox: true },
  plugins: {},
};

/**
 * The machine's half of the configuration, as a schema.
 *
 * The workflows' settings were never the top level's to carry: `policy`, the
 * second workflow's `plans` block and the third's `errands`, the tracker's
 * status names and the team map, all of them lived here and moved a workflow's
 * vocabulary in front of somebody who never drives that workflow. What stays
 * is the machine's own: the repositories, the checkouts and branches, what the
 * agent may spend and who it reaches, the engine's ceilings, and the two
 * mounting blocks the profiles and plugins are named in.
 *
 * Every entry carries a description, a type and a default, because this is
 * what `amy config explain` prints — the machine describing itself is how a
 * setting somebody has not met is found without reading the source. A dotted
 * entry is a leaf of a nested block: `agent.ladder` is one setting of the
 * agent's, written nested in the file and named whole here.
 */
export const machineSchema: ConfigSchema = {
  workflows: {
    type: "record",
    description: "the profiles this install can drive, each naming its workflow, and `amy add` writes one",
  },
  defaultWorkflow: {
    type: "string",
    description: "which profile runs when none is named. Empty means the first one declared",
    default: "",
  },
  extraPlugins: {
    type: "string[]",
    description: "packages mounted under every profile, named here or added with `amy add`",
    default: [],
  },
  add: {
    type: "string",
    description: "what `amy add <package>` does with no flag: `package` installs it, `fork` takes its source for the profile to own",
    default: "package",
  },
  forks: {
    type: "string",
    description: "where forks go, one directory per profile; empty puts them in the workflow's project, or under the profile in AMY_HOME",
    default: "",
  },
  "autoUpdate.enabled": {
    type: "boolean",
    description: "whether the machine refreshes its installed packages around workflow invocations",
    default: true,
  },
  "autoUpdate.timing": {
    type: "string",
    description: "whether the refresh happens before the work starts or after it ends",
    default: "before",
  },
  "autoUpdate.everyRuns": {
    type: "number",
    description: "how many workflow runs sit between two refreshes; the count is kept per profile",
    default: 20,
  },
  "chat.budget": {
    type: "boolean",
    description: "whether the chat's agent runs count against agent.budget: held to its ceilings and recorded in its ledger. Off, a conversation is not work and is not charged",
    default: false,
  },
  retentionDays: {
    type: "number",
    description: "how long a finished queue item is kept before it is pruned",
    default: 7,
  },
  staleClaimMs: {
    type: "number",
    description: "how long a claimed item may sit before it counts as abandoned and is handed back",
    default: 30 * 60 * 1000,
  },
  maxItemAttempts: {
    type: "number",
    description: "how many times one item may fail before the operator is told and it is dropped",
    default: 5,
  },
  "agent.model": {
    type: "string",
    description: "the model every harness runs, when the ladder names none for it",
  },
  "agent.models": {
    type: "string[]",
    description: "model tiers a harness contributes, in order, when nothing in the ladder names it",
  },
  "agent.ladder": {
    type: "string[]",
    description: "which contributed agents to try, in order, cheapest first — naming a harness here mounts it",
  },
  "agent.ladderByStep": {
    type: "record",
    description: "a ladder for one step, keyed by the workflow's action name, overriding the one above",
  },
  "agent.reviewerHints": {
    type: "record",
    description: "guidance appended when answering a particular reviewer, by host login",
  },
  "agent.timeoutMs": {
    type: "number",
    description: "how long one agent call may run before it is given up on",
  },
  "agent.budget": {
    type: "record",
    description: "what the agents may spend, per window: token and dollar ceilings, and when new work stops",
  },
  skills: {
    type: "record",
    description: "which skills answer for a step, in the order they are tried, keyed by the workflow's action name",
    default: {},
  },
  harnessSkills: {
    type: "record",
    description: "which harnesses' own installed skills are linked into ~/.amy/skills at each run and tick, by the harness plugin's name: {\"claude\": true}. false, or left out, removes the links",
    default: {},
  },
  "notify.hermes": {
    type: "string",
    description: "a Hermes delivery target, e.g. telegram. Null disables the channel",
  },
  "notify.inbox": {
    type: "boolean",
    description: "a file under .amy/needs-input plus a desktop notification, for what needs a person",
    default: true,
  },
  plugins: {
    type: "record",
    description: "one slice per plugin, keyed by package name; each plugin declares what its own looks like",
    default: {},
  },
};

export type AddMode = "fork" | "package";

/**
 * What one `amy add` does (S13): the flag when one is given, the config's
 * `add` otherwise. A mode the config names that amy does not know is refused
 * naming the key, flag or not, because the next add without one would read it.
 */
export function addModeFor(config: Pick<AmyConfig, "add">, flags: { fork?: boolean; package?: boolean }): AddMode {
  const configured = config.add ?? "package";
  if (configured !== "fork" && configured !== "package") {
    throw new Error(`\`add\` in the config is \`${String(configured)}\`, and it is \`fork\` or \`package\``);
  }
  if (flags.fork && flags.package) throw new Error("`--fork` and `--package` ask for opposite things; name one");
  if (flags.fork) return "fork";
  if (flags.package) return "package";
  return configured;
}

/** The bytes one config document holds, as a mapping; anything else is nothing to layer. */
function documentFrom(text: string): Record<string, unknown> {
  const parsed: unknown = yaml.parse(text) ?? {};
  return isMapping(parsed) ? parsed : {};
}

/**
 * Parses one config document through the loader's own merge.
 *
 * `loadConfig` reads the file an install has; this reads the annotated
 * example the docs ship — the same words, from a string. The boot check assembles the
 * template through this rather than through any second parser, because a
 * template check that parsed the file differently from the machine would
 * prove the wrong file.
 *
 * When a profile is named, its own file is laid over the bytes exactly as
 * `loadConfig` lays it over `config.yaml`: a candidate config is checked, and
 * a loop is started from it, as the profile that will read it — not as the
 * machine alone, which would drop every slice the profile keeps to itself.
 */
export function loadConfigFrom(root: string, text: string, profile?: string): AmyConfig {
  const parsed = documentFrom(text);
  const own = profile === undefined ? undefined : profileSettings(root, profile);

  return fromParsed(root, own ? layered(parsed, own) : parsed);
}

/** A YAML mapping as an operator writes one; an array or a scalar is not one. */
function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one config document, naming the file and the line when it does not
 * parse: a YAML error alone says `3:5` and not which of the machine's files
 * that line is in.
 */
function readConfigFile(file: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed: unknown = yaml.parse(fs.readFileSync(file, "utf-8"));
    return isMapping(parsed) ? parsed : {};
  } catch (error) {
    const located = error as { linePos?: [{ line?: number }]; mark?: { line?: number } };
    // `yaml` reports a 1-based `linePos`; a bare `mark` is 0-based.
    const line = located.linePos?.[0]?.line
      ?? (typeof located.mark?.line === "number" ? located.mark.line + 1 : undefined);
    const at = line === undefined ? "" : `:${line}`;
    throw new Error(`${file}${at}: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * The two keys the machine owns, so a profile's file cannot name them:
 * `workflows` is the list of profiles and `defaultWorkflow` the one a bare
 * `amy` drives, and either in a profile's file would be read as if it
 * changed the machine from inside one of them.
 */
const MACHINE_KEYS = ["workflows", "defaultWorkflow"] as const;

/**
 * What one profile's own file says, or nothing when it has none.
 *
 * Refused here rather than later because every reader goes through this:
 * a profile file naming the machine's two keys is the mistake, whichever
 * command would have read it first.
 */
export function profileSettings(root: string, profile: string): Record<string, unknown> | undefined {
  const file = profileConfig(root, profile);
  const parsed = readConfigFile(file);
  if (!parsed) return undefined;

  for (const key of MACHINE_KEYS) {
    if (!Object.hasOwn(parsed, key)) continue;
    throw new Error(
      `\`${key}\` belongs to the machine's config, so ${file} cannot name it — the list of profiles and the default stay in ${paths(root).config}`,
    );
  }

  return parsed;
}

/**
 * The profile's mapping laid over the machine's: key by key where both are
 * mappings, and the profile's value whole for anything else, so a list in a
 * profile's file replaces the machine's list rather than appending to it.
 */
function layered(general: Record<string, unknown>, own: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...general };
  for (const [key, value] of Object.entries(own)) {
    const carried = merged[key];
    merged[key] = isMapping(carried) && isMapping(value) ? layered(carried, value) : value;
  }
  return merged;
}

/**
 * What one profile reads: the machine's `config.yaml`, with
 * `profiles/<name>/config.yaml` over it when the profile has one.
 *
 * With no profile named this is the machine's file alone, which is what
 * every machine-wide command reads; with no profile file it is exactly what
 * it was before profiles had files, so an install that writes none reads as
 * it always did.
 */
export function loadConfig(root: string, profile?: string): AmyConfig {
  const general = readConfigFile(paths(root).config);
  const own = profile === undefined ? undefined : profileSettings(root, profile);
  if (!general && !own) return DEFAULT_CONFIG;

  return fromParsed(root, layered(general ?? {}, own ?? {}));
}

/**
 * The profile a process that named none drives: the machine's default, or
 * the first profile it declares, resolved the way `resolveProfile` does.
 *
 * Read tolerantly, and without the layering: this is what chooses which
 * profile's `.env` a process reads before any config is mounted, and `setup`
 * has to keep working on a machine whose config does not parse yet.
 */
export function defaultProfileOf(root: string): string | undefined {
  try {
    const parsed = readConfigFile(paths(root).config);
    const named = parsed?.defaultWorkflow;
    if (typeof named === "string" && named.trim() !== "") return named.trim();
    const declared = parsed?.workflows;
    return isMapping(declared) ? Object.keys(declared)[0] : undefined;
  } catch {
    return undefined;
  }
}

/** The profiles the machine's own file declares, in the order it declares them. */
function declaredProfiles(root: string): string[] {
  try {
    const declared = readConfigFile(paths(root).config)?.workflows;
    return isMapping(declared) ? Object.keys(declared) : [];
  } catch {
    return [];
  }
}

/**
 * Every declared profile's own config, for the commands that have to ask all
 * of them one question: whether a plugin is still mounted anywhere, and which
 * profile mounts the settings a slice carries.
 */
export function configsOfProfiles(root: string): Record<string, AmyConfig> {
  return Object.fromEntries(declaredProfiles(root).map((name) => [name, loadConfig(root, name)]));
}

/**
 * The merge behind both readers, so there is exactly one.
 *
 * No reader gets to bend a field on its way through: `loadConfigFrom` exists
 * to read the same words the same way `loadConfig` does, and a `workspaceRoot`
 * expanded here and substituted there would make the boot check prove a config
 * no install has.
 */
function autoUpdateFrom(parsed: Partial<AmyConfig>): Pick<AmyConfig, "autoUpdate" | "autoUpdateSource"> {
  const rawAutoUpdate = Object.hasOwn(parsed, "autoUpdate") ? parsed.autoUpdate : undefined;
  // Only a plain object is a mapping an operator wrote: an array is an
  // object at runtime but not a mapping, so it stays the malformed source
  // the validator refuses, instead of being silently replaced by defaults.
  const autoUpdate = typeof rawAutoUpdate === "object" && rawAutoUpdate !== null && !Array.isArray(rawAutoUpdate)
    ? { ...DEFAULT_AUTO_UPDATE, ...(rawAutoUpdate as Partial<AutoUpdateConfig>) }
    : DEFAULT_AUTO_UPDATE;
  const autoUpdateSource = rawAutoUpdate === null || (rawAutoUpdate !== undefined && typeof rawAutoUpdate !== "object")
    ? { autoUpdateSource: rawAutoUpdate }
    : Array.isArray(rawAutoUpdate)
      ? { autoUpdateSource: rawAutoUpdate }
      : {};
  return { autoUpdate, ...autoUpdateSource };
}

/**
 * The top-level keys the machine no longer carries, and where each went —
 * a workflow's own vocabulary, and the workspace with its gate.
 *
 * A config written for the old shape boots nowhere useful — the workflow or
 * plugin it tuned reads a block it no longer finds — so the loader refuses
 * the file by name, saying where the setting lives now, and `amy update` is
 * the move that rewrites it.
 */
const MOVED_KEYS: ReadonlyMap<string, string> = new Map([
  ["policy", "under the profile mounting @amykit/workflow-ticket-to-qa, as that workflow's settings.policy"],
  ["qaStatusName", "under that profile, as settings.qaStatusName"],
  ["plans", "under the profile mounting @amykit/workflow-note-to-plan, as settings.repos and settings.check"],
  ["errands", "under the profile mounting @amykit/workflow-errand, as settings.policy"],
  ["workingStatusName", "under plugins: \"@amykit/plugin-linear\", as workingStatusName"],
  ["repoByTeam", "under plugins: \"@amykit/plugin-linear\", as repoByTeam"],
  // The workspace is a capability now: the repositories, where their
  // checkouts live, their branches and their worktrees are the file-worktree
  // plugin's slice, and the gate commands are the command-gate plugin's. The
  // machine reads none of the seven.
  ["repos", "under plugins: \"@amykit/plugin-file-worktree\", as repos"],
  ["workspaceRoot", "under plugins: \"@amykit/plugin-file-worktree\", as workspaceRoot"],
  ["checkouts", "under plugins: \"@amykit/plugin-file-worktree\", as checkouts"],
  ["defaultBranch", "under plugins: \"@amykit/plugin-file-worktree\", as defaultBranch"],
  ["baseBranch", "under plugins: \"@amykit/plugin-file-worktree\", as baseBranch"],
  ["worktrees", "under plugins: \"@amykit/plugin-file-worktree\", as root and retentionDays"],
  ["gate", "under plugins: \"@amykit/plugin-command-gate\", as gate"],
]);

function refusedMovedKeys(parsed: Partial<AmyConfig>): void {
  for (const [key, where] of MOVED_KEYS) {
    if (!Object.hasOwn(parsed, key)) continue;
    throw new Error(`\`${key}\` at the top level of the config is where it used to live — it moved ${where}; \`amy update\` moves an old install`);
  }
}

function fromParsed(root: string, parsed: Partial<AmyConfig>): AmyConfig {
  refusedMovedKeys(parsed);
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    ...mountingFrom(root, parsed),
    ...autoUpdateFrom(parsed),
    notify: { ...DEFAULT_CONFIG.notify, ...(parsed.notify ?? {}) },
    skills: parsed.skills ?? {},
    // Kept as given: a value that is not a mapping is the relay's to refuse at
    // the mount, never read as every harness turned off.
    harnessSkills: parsed.harnessSkills ?? {},
    plugins: parsed.plugins ?? {},
    agent: { ...DEFAULT_CONFIG.agent, ...(parsed.agent ?? {}) },
    // Only a boolean true charges the chat; anything else is refused by configuredChatProblems.
    chat: { budget: (parsed.chat as { budget?: unknown } | undefined)?.budget === true },
    ...(Object.hasOwn(parsed, "chat") ? { chatSource: parsed.chat } : {}),
  };
}

/**
 * What a profile is read from, defaulted together.
 *
 * The three fields the profiles table and the mounting list are built from:
 * they arrive as one block in the config and one of them missing is the same
 * edit for all three, which is why they default in one place.
 */
function mountingFrom(
  root: string,
  parsed: Partial<AmyConfig>,
): Pick<AmyConfig, "workflows" | "defaultWorkflow" | "extraPlugins"> {
  return {
    workflows: Object.fromEntries(Object.entries(parsed.workflows ?? {}).map(([name, profile]) => [name, {
      ...profile,
      // Keep the operator's spelling in the configuration model. Runtime
      // profile construction resolves filesystem specs against this home, but
      // config writers and removal matching must not turn a portable `./…`
      // setting into the absolute path of this particular machine.
      workflow: profile.workflow,
    }])),
    defaultWorkflow: parsed.defaultWorkflow ?? "",
    extraPlugins: parsed.extraPlugins ?? [],
  };
}

export const EXAMPLE_CONFIG = `# The workflows this install can drive. The name is what goes after
# --workflow, and it is also the directory the profile's records and queue
# live in, so switching between two of them never loses the state of either.
#
# Declared here, not shipped: this machine drives nothing until a workflow is
# named. \`amy add <package>\` installs one and writes the profile block for
# you, from what the workflow's own schema asks for — the settings below are
# the example that teaches, and \`amy config explain\` names every setting the
# machine could take, with its type, its default and why it is there.
#
#   workflows:
#     ticket-to-qa:
#       workflow: "@amykit/workflow-ticket-to-qa"
#       settings:
#         # The status a ticket moves to when it is handed to QA.
#         qaStatusName: In QA
#         # The ceilings the ticket workflow's decisions read live here too —
#         # every one has a default, so naming a block is starting a tune.
#         # policy:
#         #   maxImplementAttempts: 3
#         #   pollBackoffMs: 300000
#
# A workflow of your own is the same shape, under ~/.amy/workflows;
# \`amy workflow new <name>\` writes one.
#
# Which one runs when --workflow is not given. The first, if this is empty.
# defaultWorkflow: ticket-to-qa
#
# Plugins mounted under every workflow, named here or added with \`amy add\`.
# Kept apart from a profile's own \`plugins:\` so a profile left on the
# recommended set stays on it and gains one, rather than having the whole
# recommendation copied into the config behind your back.
# extraPlugins: []
#
# Keep the packages this machine mounts current around workflow invocations.
# The count is kept per workflow profile under ~/.amy, so restarting does not
# reset it. Set enabled false to leave updates entirely to the operator.
autoUpdate:
  enabled: true
  timing: before
  everyRuns: 20

# Finished queue items are only useful for reading the log afterwards.
retentionDays: 7

# What the engine does with an item that went wrong rather than with the work
# itself. A claim older than staleClaimMs belonged to a worker that is no
# longer running, so the item is handed back; past maxItemAttempts the item is
# dropped and you are told, rather than retried forever in silence.
staleClaimMs: 1800000
maxItemAttempts: 5

# Which agents to try, cheapest first. Naming a harness here is what mounts
# it, so leaving codex and hermes out means they are never required to be
# installed. A failure moves to the next model of the same harness and then to
# the next harness; a rate limit skips the rest of that harness, because a
# bigger model behind the same quota is still blocked.
#
# ladderByStep overrides the list for one step, keyed by the workflow's action
# name — reading a ticket and writing the change are not the same job, and one
# list for both pays the expensive model to do the cheap step.
agent:
  ladder: [claude:sonnet, claude:opus]
  ladderByStep:
    triage: [claude:haiku]
    implement: [claude:opus]
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
  # Guidance appended when answering a particular reviewer, by host login.
  # A reviewer with known habits is cheaper to satisfy on the first pass.
  reviewerHints:
    edsger: >-
      Delete anything that is not needed. No variable that aliases an existing
      value, no check the types already guarantee, no comment stating the
      obvious, no non-null assertions.

# Who does each step. A step with no entry is done by the agent in amy's own
# words, which is every step until you say otherwise. A skill named here must
# be installed under ~/.amy/skills or a skillRoots entry, or the mount is
# refused at boot: a ladder that quietly means less than it says would first
# show up as a ticket escalating for no reason.
#
# The skills are tried in order, and each one is tried across the harness
# ladder above before the next gets a turn. Only the three steps an agent
# performs can be handed over: triage, implement, address-threads.
# skills:
#   address-threads: [/northwind-code-review, /logion]
#   triage: [/logion]

# A harness's own installed skills, linked into ~/.amy/skills at each run and
# tick, by the name of the harness's plugin. amy's own copy of a skill wins;
# false, or leaving a harness out, removes its links.
# harnessSkills:
#   claude: true

# Where the machine reaches you. It needs at least one of these.
#
# There is no tracker line any more. A tracker comment is for a question that
# needs a person, and the workflow posts those itself; progress notices belong
# on the operator's channels, which are the two below. That removes the
# pollution rather than teaching every reader to filter it.
notify:
  hermes: slack:my-channel   # a Hermes delivery target, or null
  inbox: true        # a file in .amy/needs-input plus a desktop notification

# Any command line tool, reached by a name. One adapter for all of them: the
# machine learns that a name maps to a line somebody wrote down, and nothing
# about what pup or ntn mean.
#
# The line comes only from here, and only the arguments may come from a
# workflow. A line assembled from a ticket body would be a machine that runs
# whatever a stranger can type into an issue.
#
#   "@amykit/plugin-command":
#     allow:
#       datadog: pup monitors list --json
#       notion: ntn page get
#
# The machine carries none of the vocabulary of a particular plugin: what the
# agents spend is the only top-level block left here, and the workspace — the
# repositories, where their checkouts live, their branches and their worktrees —
# is the file-worktree plugin's slice, the gate commands the command-gate
# plugin's. \`amy update\` moves an old install, \`amy config explain\`
# lists every slice's settings, and an install that drives no code mounts no
# workspace and is asked for none of it.
#
#   plugins:
#     "@amykit/plugin-file-worktree":
#       repos:
#         - Northwind/northwind-backend
#         - Northwind/northwind-frontend
#       workspaceRoot: ~/workspaces/northwind
#       defaultBranch: main
#     "@amykit/plugin-command-gate":
#       gate:
#         Northwind/northwind-backend:
#           - npm run --workspace @northwind/api lint
#           - npm run --workspace @northwind/api typecheck
#
# The tracker's settings and every workflow's own live with what mounts them.
# plugins:
#   "@amykit/plugin-notify-hermes":
#     target: slack:my-channel
#   "@amykit/plugin-file-queue":
#     retentionDays: 7
#   "@amykit/plugin-linear":
#     workingStatusName: In Progress
#     repoByTeam:
#       PROJ: Northwind/northwind-backend
`;



/**
 * The file without one top-level block, its indented lines included.
 *
 * A line walk rather than one multi-line pattern: a quantifier over indented
 * lines nested inside another is the shape that backtracks forever, and a
 * config file is not worth a regular expression nobody can reason about.
 */
function withoutBlock(text: string, header: string): string {
  const kept: string[] = [];
  let inside = false;

  for (const line of text.split("\n")) {
    if (inside && (/^[ \t]+\S/.test(line) || line.trim() === "")) continue;
    inside = line.startsWith(header);
    if (!inside) kept.push(line);
  }

  return kept.join("\n");
}

/**
 * Rewrites one top-level block, leaving every other line as it was.
 *
 * The one writer the profile and the extra list share: the block is the
 * thing being edited and there is no way to edit it without re-emitting it,
 * while everything beside it — the comments that explain what each setting
 * is for — is most of the file's value and is kept as it was.
 */
function writeBlock(root: string, header: string, block: string): void {
  const file = paths(root).config;
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const without = withoutBlock(existing, header).replace(/\n{3,}$/, "\n\n");

  fs.mkdirSync(paths(root).base, { recursive: true });
  fs.writeFileSync(file, `${without.replace(/\n*$/, "\n")}\n${block}`.trimEnd() + "\n", "utf-8");
}

/**
 * Adds one workflow profile without rewriting the rest of the operator's config.
 *
 * `settings` are the placeholders the workflow's own schema asked for: every
 * required field it carries an `example` for, written with that example — a
 * value the plugin says it would mount with, and one the operator edits. The
 * rest of the schema's settings stay out: they have defaults, and the mount
 * fills them in.
 */
export function writeWorkflowProfile(
  root: string,
  profile: string,
  workflow: string,
  config: AmyConfig,
  settings: ProfileSettings = {},
): void {
  const entry: Record<string, unknown> = { workflow, ...(Object.keys(settings).length > 0 ? { settings } : {}) };
  const workflows = { ...config.workflows, [profile]: entry };
  const defaultLine = config.defaultWorkflow || Object.keys(config.workflows).length > 0
    ? ""
    : `\ndefaultWorkflow: ${profile}\n`;

  writeBlock(
    root,
    "workflows:",
    `${yaml.stringify({ workflows })}${defaultLine}`.trimEnd(),
  );
}

/**
 * The settings one workflow's schema asks the profile to carry.
 *
 * Only the required ones without a default are the operator's to start: a
 * required setting whose machine hands it over gets no entry here, and one
 * with a default gets no entry either — leaving it out IS its default. What
 * is written is the schema's own `example`, so the value that lands in the
 * config is one the plugin itself said it would mount with.
 */
export function profileSettingsFrom(schema: ConfigSchema): ProfileSettings {
  const settings: ProfileSettings = {};
  for (const [key, spec] of Object.entries(schema)) {
    if (key.includes(".")) continue;
    if (spec.required && spec.default === undefined && spec.example !== undefined) {
      settings[key] = spec.example;
    }
  }
  return settings;
}

export function writeProfilePlugins(
  root: string,
  profile: string,
  specs: readonly string[],
  config: AmyConfig,
  briefStore = config.workflows[profile]?.briefStore,
): void {
  const declared = { ...config.workflows };
  const entry = declared[profile];
  if (!entry) throw new Error(`there is no \`${profile}\` workflow to add a plugin to`);

  const workflow = entry.workflow;
  const workflowAtRoot = workflow.startsWith(".") ? path.resolve(root, workflow) : workflow;
  // Live profiles normalize relative filesystem plugins for mounting. Preserve
  // their configured spelling when this writer serializes the profile again.
  const portableSpecs = specs.map((spec) => spec === workflowAtRoot ? workflow : spec);
  declared[profile] = { ...entry, plugins: portableSpecs, ...(briefStore !== entry.briefStore ? { briefStore } : {}) };

  writeBlock(root, "workflows:", yaml.stringify({ workflows: declared }));
}

/**
 * Drops a profile from the config, leaving every other line as it was.
 *
 * The entry only, never the state: what a profile did is in the log, which is
 * append-only because the budget is read off it.
 */
export function removeProfile(root: string, profile: string, config: AmyConfig): void {
  const declared = { ...config.workflows };
  delete declared[profile];

  writeBlock(
    root,
    "workflows:",
    Object.keys(declared).length > 0 ? yaml.stringify({ workflows: declared }) : "",
  );
  // A default is a pointer into this table. Leaving it behind reads fine now
  // but refuses a later command, so removal clears its own orphan.
  if (config.defaultWorkflow === profile) writeBlock(root, "defaultWorkflow:", "");
}

/**
 * Adds one package to the machine-wide plugin list, without rewriting the
 * rest of the operator's config.
 */
export function writeExtraPlugins(
  root: string,
  specs: readonly string[],
): void {
  writeBlock(root, "extraPlugins:", yaml.stringify({ extraPlugins: [...specs] }));
}

/**
 * Drops one package from the machine-wide plugin list.
 */
export function removeExtraPlugin(
  root: string,
  spec: string,
): void {
  const kept = loadConfig(root).extraPlugins.filter((name) => name !== spec);
  writeBlock(root, "extraPlugins:", yaml.stringify({ extraPlugins: kept }));
}

/**
 * Points the machine's default workflow at one the person chose.
 *
 * The default is a pointer into the workflows table, so it is written only
 * with a name that table holds: `amy setup` re-points it when the walk chose
 * a workflow to drive, and never leaves it on the profile that set the
 * machine up.
 */
export function writeDefaultWorkflow(root: string, name: string, _config: AmyConfig): void {
  writeBlock(root, "defaultWorkflow:", `defaultWorkflow: ${name}`);
}

/**
 * Writes the agent ladder, keeping every other line of the agent block.
 *
 * The merge is the whole point: a ladder that replaced the block would take
 * the person's model, budget and per-step ladders with it, and a walk that
 * tunes one setting must not cost the machine the rest of its own.
 */
export function writeAgentLadder(root: string, entries: readonly string[], config: AmyConfig): void {
  const agent = { ...config.agent, ladder: [...entries] };
  writeBlock(root, "agent:", yaml.stringify({ agent }).trimEnd());
}

/**
 * Merges one plugin's settings into the machine's given slices, keeping
 * every value the person did not answer anew.
 *
 * The `plugins:` block is where a mounted package's own settings live, read
 * by the boot over whatever each profile and default also says: setup writes
 * there — and only merges — so a second walk offers what the first wrote as
 * its defaults, the way `amy setup <plugin>` is meant to.
 */
export function writePluginSlice(
  root: string,
  plugin: string,
  values: Readonly<Record<string, unknown>>,
): void {
  const config = loadConfig(root);
  const held = (config.plugins[plugin] ?? {}) as Record<string, unknown>;
  const plugins = { ...config.plugins, [plugin]: { ...held, ...values } };
  writeBlock(root, "plugins:", yaml.stringify({ plugins }).trimEnd());
}
