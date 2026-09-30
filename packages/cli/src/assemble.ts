import fs from "node:fs";
import path from "node:path";
import { CommandRunner, Engine, EventLog, Mounted, Plugin, mount, unmetNeeds } from "@amykit/core";
import { AmyConfig } from "./config.js";
import { LoadResult } from "./loader.js";
import { keepsLegacyLayout, profilePaths } from "./paths.js";
import { Profile } from "./profiles.js";
import { hostPaths, legacyBriefDirectory, pluginList, pluginSlices } from "./slices.js";

/** What assembling needs from the process running it, and nothing it decides. */
export interface AssemblyServices {
  readonly runner: CommandRunner;
  readonly load: (specs: readonly string[]) => Promise<LoadResult>;
  /** The event log for one file, which is the budget ledger of that profile. */
  readonly log: (file: string) => EventLog;
  /** The host's own glue, mounted after everything the config asked for. */
  readonly host: readonly Plugin[];
}

export type Assembled = { ok: true; engine: Engine; mounted: Mounted } | { ok: false; problems: string[] };

/**
 * Loads the plugins the config asks for and assembles them.
 *
 * Every refusal happens here, by name, before a ticket is touched: a plugin
 * that will not import, a setting that is not one it has, two plugins
 * claiming the same port, an action the workflow emits that nothing can run.
 */
export async function assembleProfile(
  home: string,
  config: AmyConfig,
  profile: Profile,
  services: AssemblyServices,
): Promise<Assembled> {
  const place = profilePaths(home, profile);
  const specs = pluginList(config, profile);

  const loaded = await services.load(specs);
  if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };
  if (profile.project && !loaded.bySpec.has(profile.workflow)) {
    return { ok: false, problems: [`${profile.project.phase}/: configured workflow plugin is not mounted`] };
  }

  const slices = pluginSlices(config, profile, home);
  adoptLegacyBriefs(home, config, profile, slices);

  const outcome = await mount(
    [...loaded.plugins, ...services.host],
    slices,
    {
      runner: services.runner,
      now: () => new Date(),
      log: services.log(place.log),
      paths: hostPaths(config, place.base, profile),
    },
    profile.project ? {
      workflowLabel: `${profile.project.phase}/`,
      workflowPlugin: loaded.bySpec.get(profile.workflow),
    } : undefined,
  );

  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const { mounted } = outcome;
  if (!mounted.engine) {
    return { ok: false, problems: ["no plugin mounted an engine, so nothing can advance work"] };
  }
  if (!mounted.workflow) {
    return { ok: false, problems: ["no plugin mounted a workflow, so there is no order to follow"] };
  }

  const unmet = unmetNeeds(mounted, mounted.workflow);
  if (unmet.length > 0) return { ok: false, problems: unmet };

  return { ok: true, engine: mounted.engine, mounted };
}

/**
 * A workflow promoted to a phase kept its briefs where an ordinary profile
 * keeps them, and its siblings read the project's artifact root.
 *
 * Copied into that root once, never moved: an ordinary profile beside it may
 * still read the old directory. A brief already in the root wins, because a
 * sibling phase wrote it after the promotion. Each copy is linked into place,
 * so a phase reading the root never sees a half-copied brief.
 */
function adoptLegacyBriefs(
  home: string,
  config: AmyConfig,
  profile: Profile,
  slices: Readonly<Record<string, unknown>>,
): void {
  const artifacts = profilePaths(home, profile).artifacts;
  if (!artifacts || !keepsLegacyLayout(home, profile)) return;

  const marker = path.join(artifacts, `.adopted-briefs-${profile.name}`);
  if (fs.existsSync(marker)) return;

  const source = path.join(home, legacyBriefDirectory(config));
  const slice = slices["@amykit/plugin-file-brief-store"] as { directory?: unknown } | undefined;
  const target = path.join(artifacts, typeof slice?.directory === "string" ? slice.directory : "briefs");
  fs.mkdirSync(target, { recursive: true });

  const briefs = fs.existsSync(source) ? fs.readdirSync(source).filter((name) => name.endsWith(".json")) : [];
  for (const name of briefs) {
    const temporary = path.join(target, `${name}.${process.pid}.adopt.tmp`);
    try {
      fs.copyFileSync(path.join(source, name), temporary);
      fs.linkSync(temporary, path.join(target, name));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  fs.writeFileSync(marker, `${new Date().toISOString()}\n`, "utf-8");
}
