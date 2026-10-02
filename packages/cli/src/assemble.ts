import { CommandRunner, Engine, EventLog, Mounted, Plugin, mount, unmetNeeds } from "@amykit/core";
import { AmyConfig } from "./config.js";
import { LoadResult } from "./loader.js";
import { profilePaths } from "./paths.js";
import { Profile } from "./profiles.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";

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

  const outcome = await mount(
    [...loaded.plugins, ...services.host],
    pluginSlices(config, profile, home),
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
