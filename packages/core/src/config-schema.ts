export type ConfigFieldType = "string" | "number" | "boolean" | "string[]" | "record" | "oneOf";

type ConfigValueFor<T extends ConfigFieldType> =
  T extends "string" ? string
    : T extends "number" ? number
      : T extends "boolean" ? boolean
        : T extends "string[]" ? string[]
          : T extends "record" ? Record<string, unknown>
            : string;

/** One field, coupled to the value type it promises at boot. */
export type ConfigField = {
  [T in ConfigFieldType]: {
    readonly type: T;
    /** What the field is for. Printed when the field is missing or wrong. */
    readonly description: string;
    /**
     * The dotted group whose keys this value must name, for `type: "oneOf"`.
     *
     * A setting that says *which* level, repository or scale applies can only
     * be right if it names something the config declares elsewhere, and a
     * string that has to look right is a string nothing checks.
     */
    readonly group?: T extends "oneOf" ? string : never;
    readonly required?: boolean;
    readonly default?: ConfigValueFor<T>;
    /**
     * A value the plugin would mount with, never applied to a config.
     *
     * For a required field the plugin checks beyond its type — an id that has
     * to look like an id — so the reference docs can ask the plugin what it
     * mounts without handing it a blank it rightly refuses.
     */
    readonly example?: unknown;
  };
}[ConfigFieldType];

/**
 * What one plugin says its configuration looks like.
 *
 * Declared by the plugin rather than known by the host, because the host has
 * no business knowing that a tracker has a status name or that a notifier has
 * a channel. Kept to five types on purpose: a plugin that needs more shape
 * than this wants its own validation, not a bigger schema language here.
 *
 * A key may be dotted, and a dotted key is how a group of settings one plugin
 * owns is described one setting at a time: `policy.maxAttempts` says the
 * policy block carries a `maxAttempts` number, without the block collapsing
 * into one untyped `record` nobody can explain. The config file keeps writing
 * the group nested; the schema names every leaf it accepts.
 */
export type ConfigSchema = Record<string, ConfigField>;

/** The keys a dotted group `G` declares, as the values a `oneOf` setting may name. */
type GroupKeys<S extends ConfigSchema, G extends string> = {
  [K in keyof S]: K extends `${G}.${infer Leaf}` ? (Leaf extends `${string}.${string}` ? never : Leaf) : never
}[keyof S];

/** A value, narrowed by whether the field is required and what its default is. */
type UnlessOptional<Field extends ConfigField, Value> =
  Field extends { readonly required: true }
    ? Value
    : Field extends { readonly default: infer Default }
      ? undefined extends Default ? Value | undefined : Value
      : Value | undefined;

/** What a `oneOf` setting may name: the keys of its group, or any name when the group names none. */
type Named<Field extends ConfigField, S extends ConfigSchema> =
  Field extends { readonly type: "oneOf"; readonly group: infer Group extends string }
    ? ([GroupKeys<S, Group>] extends [never] ? string : GroupKeys<S, Group>)
    : ConfigValueFor<Field["type"]>;

/** The value one schema field promises after validation, by its required/default shape. */
export type ValueFor<Field extends ConfigField, S extends ConfigSchema = ConfigSchema> =
  UnlessOptional<Field, Named<Field, S>>;

/** One intersection piece a dotted schema key contributes to the plugin's config. */
type PieceOf<S extends ConfigSchema, K extends keyof S> = K extends `${infer Head}.${infer Rest}`
  ? Rest extends `${infer Inner}.${infer Tail}`
    ? { [H in Head]: RestPieceOf<Tail, Inner, ValueFor<S[K], S>> }
    : { [H in Head]: { [L in Rest]: ValueFor<S[K], S> } }
  : never;

/** The inner segments of a path of three or more, folded into nested groups.
 *
 * `Value` arrives as the field's validated value, not the schema's own
 * descriptor: the plugin reads a number where the schema declared one, not
 * the declaration itself. */
type RestPieceOf<Rest extends string, Head extends string, Value> = Rest extends `${infer Inner}.${infer Tail}`
  ? { [H in Head]: RestPieceOf<Tail, Inner, Value> }
  : { [H in Head]: { [L in Rest]: Value } };

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/**
 * The post-validation shape a schema promises to its plugin.
 *
 * Undotted keys carry their own values; dotted keys meet as nested groups.
 * A key with no dots contributes `never` to the intersection, which is the
 * union's own identity, so a schema without dotted keys produces exactly
 * what it always produced.
 */
export type ConfigOf<S extends ConfigSchema> = {
  [K in keyof S as K extends `${string}.${string}` ? never : K]: ValueFor<S[K], S>
} & UnionToIntersection<{ [K in keyof S]: K extends `${string}.${string}` ? PieceOf<S, K> : never }[keyof S]>;

export type ConfigResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; problems: string[] };

/**
 * Checks one plugin's configuration against what it declared.
 *
 * Names the plugin and the field in every problem, because "invalid config"
 * with nothing else in it is the error message that costs an hour. Reports
 * every problem rather than the first, so one boot fixes one round of edits.
 */
export function validateConfig(
  plugin: string,
  schema: ConfigSchema,
  value: unknown,
): ConfigResult {
  if (value !== undefined && !isRecord(value)) {
    return { ok: false, problems: [`${plugin}: configuration must be a mapping`] };
  }

  const given = value ?? {};
  const { own, groups, named, problems, config } = splitSchema(plugin, schema);

  acceptOwn(plugin, own, given, config, named, problems);

  for (const [head, leaves] of groups) {
    if (!Object.hasOwn(given, head)) {
      // An absent group is no different from an empty one: a leaf the schema
      // requires is still owed, named with the path it would have been
      // written at, and a group that requires nothing fills its defaults
      // where the plugin expects to read them.
      const owed = [...leaves.entries()].filter(([, spec]) => spec.required);
      if (owed.length > 0) {
        problems.push(
          ...owed.map(([leaf, spec]) => `${plugin}: \`${head}.${leaf}\` is required — ${spec.description}`),
        );
        continue;
      }
      const filled = fill(leaves);
      // A group whose every leaf is optional has nothing to fill in, and the
      // type the schema promised (the group is read without a guard) is
      // still owed: the plugin meets an empty mapping, not a missing one.
      config[head] = filled ?? emptyMapping();
      continue;
    }

    const givenHead = given[head];
    if (!isRecord(givenHead)) {
      problems.push(
        `${plugin}: \`${head}\` must be a mapping whose settings are ${[...leaves.keys()].map((leaf) => `\`${head}.${leaf}\``).join(", ")}, got ${describe(givenHead)}`,
      );
      continue;
    }

    const problemsInGroup = validateInto(plugin, head, leaves, givenHead, named, (filled) => {
      config[head] = filled;
    });
    problems.push(...problemsInGroup);
  }

  rejectUnknown(plugin, given, own, groups, problems);

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config };
}

/** Splits a dotted schema into its own keys and per-group leaves. */
function splitSchema(
  plugin: string,
  schema: ConfigSchema,
): {
  own: { key: string; spec: ConfigField }[];
  groups: Map<string, Map<string, ConfigField>>;
  named: Map<string, string[]>;
  problems: string[];
  config: Record<string, unknown>;
} {
  const own: { key: string; spec: ConfigField }[] = [];
  const groups = new Map<string, Map<string, ConfigField>>();
  const problems: string[] = [];
  const config: Record<string, unknown> = {};
  const named = namesDeclared(schema);
  // A default naming a value the group does not declare is refused even when
  // every config leaves the setting out: it would be applied silently, and a
  // level misspelt there is a threshold nobody ever weighs.
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.type !== "oneOf" || spec.default === undefined) continue;
    const outside = namesNothing(plugin, key, spec, spec.default, named);
    if (outside) problems.push(outside);
  }
  for (const [key, spec] of Object.entries(schema)) {
    const [head, ...path] = key.split(".");
    if (path.length === 0) {
      own.push({ key, spec });
      continue;
    }
    if (head === undefined || head === "") {
      problems.push(`${plugin}: a schema key cannot begin with a dot`);
      continue;
    }
    let group = groups.get(head);
    if (!group) groups.set(head, (group = new Map()));
    group.set(path.join("."), spec);
  }
  return { own, groups, named, problems, config };
}

/**
 * Every group a schema's dotted keys name, and the leaf names directly under
 * it.
 *
 * `escalation.scale.patient` says `escalation` carries `scale` and
 * `escalation.scale` carries `patient`, so a setting typed `oneOf` with
 * `group: "escalation.scale"` may name any of the levels that key declares
 * and nothing else.
 */
function namesDeclared(schema: ConfigSchema): Map<string, string[]> {
  const named = new Map<string, string[]>();
  for (const key of Object.keys(schema)) {
    const path = key.split(".");
    for (let at = 1; at < path.length; at += 1) {
      const group = path.slice(0, at).join(".");
      const leaf = path[at]!;
      const keys = named.get(group) ?? [];
      if (!keys.includes(leaf)) keys.push(leaf);
      named.set(group, keys);
    }
  }
  return named;
}

/** An empty mapping the validator hands the plugin where the schema promised a group. */
function emptyMapping(): Record<string, unknown> {
  return {};
}

/**
 * Accepts and checks the schema's own (undotted) keys against what the
 * machine wrote: required named when absent, defaults filled in, and any
 * value of the wrong shape named with the type it asked for.
 */
function acceptOwn(
  plugin: string,
  own: { key: string; spec: ConfigField }[],
  given: Record<string, unknown>,
  config: Record<string, unknown>,
  named: ReadonlyMap<string, readonly string[]>,
  problems: string[],
): void {
  for (const { key, spec } of own) {
    const present = Object.hasOwn(given, key);
    if (!present) {
      if (spec.required) {
        problems.push(`${plugin}: \`${key}\` is required — ${spec.description}`);
      } else if (spec.default !== undefined) {
        config[key] = spec.default;
      }
      continue;
    }

    const supplied = given[key];
    if (!matches(spec.type, supplied)) {
      problems.push(
        `${plugin}: \`${key}\` must be ${spec.type === "oneOf" ? "a name" : spec.type}, got ${describe(supplied)} — ${spec.description}`,
      );
      continue;
    }

    const outside = namesNothing(plugin, key, spec, supplied, named);
    if (outside) {
      problems.push(outside);
      continue;
    }

    config[key] = supplied;
  }
}

/**
 * An unknown key is almost always a typo in a field that matters, and
 * ignoring it means the setting silently never applied. A dotted schema
 * names its group's leaves, so anything the machine wrote that no dotted
 * path declares is refused with the path it was written at — including
 * levels inside a group, where a typo three segments deep must not fall
 * through to a silent default.
 */
function rejectUnknown(
  plugin: string,
  given: Record<string, unknown>,
  own: { key: string; spec: ConfigField }[],
  groups: Map<string, Map<string, ConfigField>>,
  problems: string[],
): void {
  for (const key of Object.keys(given)) {
    if (own.some(({ key: ownKey }) => ownKey === key)) continue;
    const leaves = groups.get(key);
    if (leaves === undefined) {
      problems.push(`${plugin}: \`${key}\` is not a setting this plugin has`);
      continue;
    }
    // A declared group still owes its given shape. Scalars and wrong shapes
    // are named by the group's own validator below; what is left to refuse
    // here is everything the settings carry that no declared path reaches.
    rejectOutsidePaths(plugin, key, given[key], [...leaves.keys()], [], problems);
  }
}

/** Refuses the names a group was given that its schema's paths do not reach.
 *
 * Every recursion level walks the leaves as they are spelled at that level —
 * `[...walked]` restarts, so a declared path's second segment is compared
 * with its own spelling, not with the path it sits under — while `full`
 * carries what the operator wrote, so a refusal names every segment it sat
 * at. */
function rejectOutsidePaths(
  plugin: string,
  head: string,
  value: unknown,
  declaredLeaves: readonly string[],
  full: string[],
  problems: string[],
): void {
  if (!isRecord(value)) return;
  const leaves = [...declaredLeaves];
  for (const name of Object.keys(value)) {
    const path = [head, ...full, name];
    const reaching = leaves.filter((leaf) => leaf === name || leaf.startsWith(name + "."));
    if (reaching.length === 0) {
      problems.push(`${plugin}: \`${path.join(".")}\` is not a setting this plugin has`);
      continue;
    }
    if (reaching.every((leaf) => leaf !== name)) {
      rejectOutsidePaths(
        plugin,
        head,
        value[name],
        reaching.map((leaf) => leaf.slice(name.length + 1)),
        [...full, name],
        problems,
      );
    }
  }
}

/**
 * Validates one given group of nested settings into its filled shape.
 *
 * `emit` receives the whole filled group even when a leaf misbehaved — a
 * group whose one leaf is wrong still carries the leaves that were right,
 * so one round of edits fixes one round of settings.
 */
function validateInto(
  plugin: string,
  head: string,
  leaves: ReadonlyMap<string, ConfigField>,
  given: Record<string, unknown>,
  named: ReadonlyMap<string, readonly string[]>,
  emit: (filled: Record<string, unknown>) => void,
): string[] {
  const problems: string[] = [];
  const filled = fill(leaves) ?? {};

  for (const [path, spec] of leaves) {
    const at = path.split(".");
    let source: unknown = given;
    let where = head;
    let present = true;
    for (const segment of at) {
      if (!isRecord(source) || !Object.hasOwn(source, segment)) {
        present = false;
        break;
      }
      source = (source as Record<string, unknown>)[segment];
      where = `${where}.${segment}`;
    }

    if (present) {
      const problem = leafProblem(plugin, where, spec, source, named);
      if (problem !== undefined) {
        problems.push(problem);
        continue;
      }
      leafSet(filled, at, source);
      continue;
    }
    if (spec.required) {
      problems.push(`${plugin}: \`${head}.${path}\` is required — ${spec.description}`);
    }
  }

  for (const key of Object.keys(given)) {
    const covered = [...leaves.keys()].some((leaf) => leaf === key || leaf.startsWith(`${key}.`));
    if (!covered) {
      problems.push(`${plugin}: \`${head}.${key}\` is not a setting this plugin has`);
    }
  }

  emit(filled);
  return problems;
}

/** The defaults a group's leaves fill in with, or nothing when none has one. */
function fill(leaves: ReadonlyMap<string, ConfigField>): Record<string, unknown> | undefined {
  const filled: Record<string, unknown> = {};
  for (const [path, spec] of leaves) {
    if (spec.default === undefined || spec.required) continue;
    leafSet(filled, path.split("."), spec.default);
  }
  return Object.keys(filled).length > 0 ? filled : undefined;
}

function leafSet(into: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (rest.length === 0) {
    into[head] = value;
    return;
  }
  const child = isRecord(into[head]) ? (into[head] as Record<string, unknown>) : (into[head] = {});
  leafSet(child, rest, value);
}

function matches(type: ConfigFieldType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "record":
      return isRecord(value);
    case "oneOf":
      return typeof value === "string";
  }
}

/** Why a leaf's value is refused: the type it is not, or the name its group does not declare. */
function leafProblem(
  plugin: string,
  where: string,
  spec: ConfigField,
  value: unknown,
  named: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  if (!matches(spec.type, value)) {
    const asked = spec.type === "oneOf" ? "a name" : spec.type;
    return `${plugin}: \`${where}\` must be ${asked}, got ${describe(value)} — ${spec.description}`;
  }
  return namesNothing(plugin, where, spec, value, named);
}

/**
 * Why a `oneOf` value is not one of the names its group declares, or nothing.
 *
 * Naming the accepted values is the whole point: a level misspelt into a
 * setting that looks like every other string is a threshold nobody applies.
 */
function namesNothing(
  plugin: string,
  where: string,
  spec: ConfigField,
  value: unknown,
  named: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  if (spec.type !== "oneOf") return undefined;
  const group = (spec as { readonly group?: string }).group ?? "";
  const keys = named.get(group) ?? [];
  if (keys.length === 0) {
    return `${plugin}: \`${where}\` must name a value of \`${group}\`, which this schema declares no keys for — ${spec.description}`;
  }
  if (typeof value === "string" && keys.includes(value)) return undefined;
  return `${plugin}: \`${where}\` must be one of ${keys.map((key) => `\`${key}\``).join(", ")}, got ${JSON.stringify(value)} — ${spec.description}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
