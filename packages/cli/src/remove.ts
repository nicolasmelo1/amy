import { AmyConfig } from "./config.js";
import { withoutSpec } from "./add.js";
import { Profile, profiles } from "./profiles.js";
import { pluginList } from "./slices.js";

export type Carrier = { place: "profile" | "extras" | "workflow"; profile?: string };

/** Which config entry a removal edits; machine-wide extras take precedence. */
export function carriedBy(config: AmyConfig, profile: Profile, spec: string): Carrier {
  if (config.extraPlugins.includes(spec)) return { place: "extras" };
  const owning = Object.entries(config.workflows).find(([, entry]) => entry.workflow === spec);
  if (owning) return { place: "workflow", profile: owning[0] };
  if (pluginList(config, profile).includes(spec)) return { place: "profile", profile: profile.name };
  return { place: "extras" };
}

/** The exact config `remove` would write, held in memory for its boot trial. */
export function configWithout(config: AmyConfig, profile: Profile, spec: string, carrier: Carrier): AmyConfig {
  if (carrier.place === "extras") {
    return { ...config, extraPlugins: withoutSpec(config.extraPlugins, spec) };
  }
  if (carrier.place === "workflow" && carrier.profile) {
    return {
      ...config,
      workflows: Object.fromEntries(Object.entries(config.workflows).filter(([name]) => name !== carrier.profile)),
    };
  }

  const entry = config.workflows[profile.name];
  if (!entry) return config;
  // Freeze only the selected profile's own/recommended set. Extras remain
  // machine-wide and must not be copied into this profile by a local removal.
  const own = profile.plugins.length > 0
    ? profile.plugins
    : pluginList(config, profile).filter((name) => !config.extraPlugins.includes(name));
  return {
    ...config,
    workflows: { ...config.workflows, [profile.name]: { ...entry, plugins: withoutSpec(own, spec) } },
  };
}

/** Whether any remaining profile still mounts this package, even by recommendation. */
export function stillMounted(config: AmyConfig, spec: string): boolean {
  return Object.values(profiles(config)).some((candidate) => pluginList(config, candidate).includes(spec));
}
