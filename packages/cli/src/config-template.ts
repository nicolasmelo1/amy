import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mount, MountOutcome, NodeCommandRunner } from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import type { Roster } from "@amykit/workflow-ticket-to-qa";
import { EXAMPLE_CONFIG, loadConfigFrom } from "./config.js";
import { loadEnv } from "./env.js";
import { hostPlugin } from "./hostPlugin.js";
import { load } from "./loader.js";
import { profiles } from "./profiles.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";

/**
 * One settings surface: what a block of the config accepts, and where it is.
 *
 * `accepts` is the defaults object rather than a list of names, so the source
 * of truth is the thing the loader actually merges over. A setting added
 * there and nowhere else is exactly the case this catches.
 */
export interface SettingsSurface {
  /** Where the block sits, dotted. Empty for the top level. */
  readonly at: string;
  readonly accepts: object;
  /** The block as the template set it, or undefined if it set none. */
  readonly given: object | undefined;
}

/**
 * Whether the config `amy init` writes is one this build can read, and one
 * that names every setting there is.
 *
 * Two failures, and both of them shipped before this existed.
 *
 * The loud one: the template carried `agent:` twice. YAML refuses a duplicate
 * key rather than merging it, so `amy init` wrote a file `loadConfig` threw
 * on, and the next command anybody ran died. No test had ever parsed the
 * template — only the roster beside it.
 *
 * The quiet one: `pollBackoffMs` was configurable for its whole life and
 * appeared nowhere, so the only way to find it was to read the source. A
 * setting nobody can discover is a setting that does not exist, and the cost
 * lands on whoever concludes the machine cannot do what it does.
 *
 * Naming is enough for the second one. A setting commented out with the
 * reason is documented, and several of them are only worth turning on
 * deliberately.
 */
export function checkConfigTemplate(
  template: string,
  surfaces: readonly SettingsSurface[],
  parseErrors: readonly string[],
): string[] {
  const problems = parseErrors.map(
    (error) =>
      `the template does not parse, so \`amy init\` writes a file nothing can read — ${error}`,
  );

  // Everything below reads the parsed document, so a template that does not
  // parse is reported once rather than as a cascade of missing blocks.
  if (problems.length > 0) return problems;

  // Every word in the template, once. A name is looked up here rather than
  // matched with a pattern built from it, which is both stricter than a
  // substring — `ladder` would otherwise be satisfied by `ladderByStep` — and
  // one pass instead of one per setting.
  const namesInTemplate = new Set(template.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);

  for (const surface of surfaces) {
    for (const key of Object.keys(surface.given ?? {})) {
      if (!Object.hasOwn(surface.accepts, key)) {
        problems.push(
          `\`${named(surface.at, key)}\` is in the template and is not a setting — nothing would read it`,
        );
      }
    }

    for (const key of Object.keys(surface.accepts)) {
      if (!namesInTemplate.has(key)) {
        problems.push(
          `\`${named(surface.at, key)}\` is a setting and the template never names it — nobody can find it`,
        );
      }
    }
  }

  return problems;
}

function named(at: string, key: string): string {
  return at ? `${at}.${key}` : key;
}

export interface BootCheck {
  ok: boolean;
  problems: string[];
}

/**
 * Whether the config `amy init` writes is one that boots.
 *
 * The check above proves the file parses and names every setting; this proves
 * the one thing that matters most: assembling it against the plugins it names
 * produces a working host. Both syntax half and boot half live in one module
 * because they are one claim about one file — `npm run check:config` runs
 * them in that order, and the unit tests hold them side by side.
 *
 * Assembled against the build rather than parsed as text, so a template bug
 * is caught by the same `mount` that will refuse it on somebody's laptop —
 * there is no second interpretation of the config to drift apart.
 */
export async function checkConfigBoots(configRoot: string): Promise<BootCheck> {
  // `amy init` writes the example; the loader reads it back the way any
  // command would. Failures here are the parse half of the check, which is
  // `checkConfigTemplate`'s to report — this is the boot half.
  const config = loadConfigFrom(configRoot, EXAMPLE_CONFIG);

  // The default profile is what a fresh install runs first, so it is the one
  // whose mount the template has to guarantee. A second workflow's block is
  // operator-edited config, not template text, and is somebody else's to
  // refuse on the day it is added.
  const profile = profiles(config)[config.defaultWorkflow] ?? Object.values(profiles(config))[0]!;
  if (!profile) return { ok: false, problems: ["the template declares no workflow to drive"] };

  // The environment a real machine boots from, read the way every command
  // reads it — from the config root it was handed, not from wherever the
  // caller happened to be standing. A check whose answer moved with the
  // working directory would pass on the machine that ran it and nowhere else.
  //
  // What a fresh install starts without is the operator's first errand —
  // `amy doctor` says FAIL and names the key — not a fault in the text `amy
  // init` wrote, so a credential this machine has not been given yet is stood
  // in for rather than reported as a template bug. Only when absent: a value
  // already exported stays the one the check means.
  const credentials: Record<string, string> = { LINEAR_API_KEY: "lin_api_boot-check" };
  const borrowed = borrowEnv(credentials);
  // `loadEnv` only sets a name nothing had set, so the names it reports back
  // are exactly the ones to unset again.
  const fromFile = loadEnv(configRoot);

  // A state directory of its own, outside the checkout: the mount writes the
  // empty log a fresh install would have, and a check that littered the
  // source tree would be a finding the next `sf check` would rightly report
  // (L4.ROOT_FILES_ARE_DECLARED).
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "amy-boot-check-"));

  // Everything borrowed above is given back below, on every path out. A check
  // is an observation: run twice it answers the same, and the process it ran
  // in is left as it was found — this one runs inside `amy doctor` and inside
  // a test suite whose next case must not inherit its stand-in credential.
  try {
    const specs = pluginList(config, profile);
    const loaded = await load(specs);
    // Nothing below means anything if a named plugin is missing: that is an
    // install problem, said in the loader's own words, and the caller decides
    // whether it is this check's to enforce.
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

    // The roster `amy init` writes beside the config, handed to the host
    // plugin unread: the check mounts the machine, it does not judge the roster.
    const roster: Roster = {
      confirmedOn: "1970-01-01",
      reviewers: [],
      qa: { tracker: "", host: "", available: false },
    };

    const outcome: MountOutcome = await mount(
      [...loaded.plugins, hostPlugin(() => roster)],
      pluginSlices(config, profile),
      {
        // A runner a boot never uses: registration wires the CLIs, the ladder
        // is judged from the rungs' names, and the engine is built on the
        // first tick. The real one shells out; this one is the real adapter
        // and reaches nothing, because nothing here asks it to.
        runner: new NodeCommandRunner(),
        now: () => new Date(),
        // The budget is read off a log at boot; an empty one is what a fresh
        // install has.
        log: new FileEventLog(path.join(state, "events"), () => new Date()),
        paths: hostPaths(config, state),
      },
    );

    return outcome.ok ? { ok: true, problems: [] } : { ok: false, problems: outcome.problems };
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
    restoreEnv(borrowed);
    for (const key of fromFile) delete process.env[key];
  }
}

/**
 * Sets the names the mount needs and remembers what was there, so a caller can
 * put the environment back exactly as it found it — including unsetting a name
 * that was never set.
 */
function borrowEnv(values: Record<string, string>): Map<string, string | undefined> {
  const before = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return before;
}

function restoreEnv(before: Map<string, string | undefined>): void {
  for (const [key, value] of before) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
