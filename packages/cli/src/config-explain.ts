import { ConfigSchema } from "@amykit/core";
import { load } from "./loader.js";
import { machineSchema, type AmyConfig } from "./config.js";
import type { Profile } from "./profiles.js";
import { pluginList, pluginSlices } from "./slices.js";

/**
 * `amy config explain`, as data rather than as stdout.
 *
 * The command prints lines; the tests need what the lines say without a
 * subprocess, and the gate needs the same report from another process than
 * this one's console. One producer, three consumers.
 */
export type ExplainReport = {
  /** Console-ready lines, machine first, then each mounted plugin. */
  lines: string[];
  /** What would not load, said the way the boot would say it. */
  problems: string[];
  /** The ask named nothing mounted. */
  refused?: string;
};

/**
 * Every setting one schema carries, on one line each.
 *
 * The line is what an operator reads to decide a value: what it is called,
 * what kind of thing it takes, whether the machine carries a value for it
 * right now, and what happens when it is left out — the schema's shape, the
 * machine's effective choice beside it.
 */
export function describeEntries(schema: ConfigSchema, given?: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(schema).map(([key, spec]) => {
    const at = pathOf(given, key);
    const supplied = at === nothing ? undefined : `set ${stringOf(at)}`;
    const when = supplied ?? (spec.required ? "required" : spec.default === undefined ? "not set" : `default ${stringOf(spec.default)}`);
    return `  ${key.padEnd(40)}${spec.type.padEnd(10)}${when.padEnd(24)}${spec.description}`;
  });
}

/** What a nested settings mapping carries at a dotted path, or `nothing` when it carries none of it. */
const nothing = Symbol("not supplied");

function pathOf(given: Readonly<Record<string, unknown>> | undefined, dotted: string): unknown {
  if (given === undefined) return nothing;
  let node: unknown = given;
  for (const segment of dotted.split(".")) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return nothing;
    node = (node as Record<string, unknown>)[segment];
  }
  return node === undefined ? nothing : node;
}

function stringOf(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

/**
 * Who this machine would read, machine first, then what it mounts.
 *
 * Narrowing to one plugin exists because a machine mounts plenty — a
 * workflow, the engine, the tracker, the file log — and an operator tuning
 * one of them wants that one's settings, with the mounted order preserved so
 * the report reads the way the boot does.
 */
export async function explainReport(config: AmyConfig, profile: Profile, plugin: string | undefined, resolve: (spec: string) => string = (spec) => spec, pluginsRoot?: string): Promise<ExplainReport> {
  // Discovering a setting here is the reason the top level stopped carrying
  // any workflow's vocabulary: the machine's own settings are one short list,
  // and everything a workflow answers belongs to the thing that answers.
  const lines: string[] = ["machine:"];
  // The machine's own settings are the short list the top level always was:
  // named, typed, defaulted — a profile's settings are dumped in full under
  // the plugin they belong to, and a machine record here would bury the one
  // value the operator is looking for under every other profile's noise.
  for (const line of describeEntries(machineSchema)) lines.push(line);

  const specs = pluginList(config, profile);
  const loaded = await load(specs, resolve, pluginsRoot);
  // What the machine would actually mount, not what its schema asks for: an
  // operator tuning one setting wants the value the mount would hand the
  // plugin, with the schema's default named for what the machine left out.
  // The mount reads each plugin by its own name, so the profile's workflow
  // — a local one can be spelled by path — answers to the name the loader
  // produced, the same map the boot passes.
  const slots = pluginSlices(config, profile, undefined, new Map([[profile.workflow, loaded.bySpec.get(profile.workflow)?.name ?? profile.workflow]]));

  if (plugin !== undefined && !specs.includes(plugin)) {
    return {
      lines,
      problems: loaded.problems,
      refused: `nothing mounted names ${plugin}. Mounted: ${specs.join(", ")}`,
    };
  }

  const chosen = plugin === undefined ? specs : specs.filter((spec) => spec === plugin);
  for (const spec of chosen) lines.push(...describeMounted(loaded, slots, spec));

  return { lines, problems: loaded.problems };
}

/** One plugin's section of the report: what it carries, and what the mount would hand it. */
function describeMounted(
  loaded: Awaited<ReturnType<typeof load>>,
  slots: Record<string, unknown>,
  spec: string,
): string[] {
  const module = loaded.bySpec.get(spec);
  const schema = module?.configSchema;
  const effective = slots[module?.name ?? spec];
  const lines = ["", `${spec}${schema === undefined ? " (no settings of its own)" : ":"}`];
  if (schema !== undefined && Object.keys(schema).length > 0) {
    for (const line of describeEntries(schema, isMapping(effective) ? effective : undefined)) lines.push(line);
  }
  return lines;
}

/** Whether a value is the mapping a slice's settings arrive as. */
function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}