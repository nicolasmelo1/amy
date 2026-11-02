export type ConfigFieldType = "string" | "number" | "boolean" | "string[]" | "record";

type ConfigValueFor<T extends ConfigFieldType> =
  T extends "string" ? string
    : T extends "number" ? number
      : T extends "boolean" ? boolean
        : T extends "string[]" ? string[]
          : Record<string, unknown>;

/** One field, coupled to the value type it promises at boot. */
export type ConfigField = {
  [T in ConfigFieldType]: {
    readonly type: T;
    /** What the field is for. Printed when the field is missing or wrong. */
    readonly description: string;
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

/** The value one schema field promises after validation, by its required/default shape. */
export type ValueFor<Field extends ConfigField> = ConfigValueFor<Field["type"]> extends infer Value
  ? Field extends { readonly required: true }
    ? Value
    : Field extends { readonly default: infer Default }
      ? undefined extends Default ? Value | undefined : Value
      : Value | undefined
  : never;

/** The post-validation shape a schema promises to its plugin. */
export type ConfigOf<S extends ConfigSchema> = {
  [K in keyof S as K extends `${string}.${string}` ? never : K]: ValueFor<S[K]>
};

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
  const problems: string[] = [];
  const config: Record<string, unknown> = {};

  const own: { key: string; spec: ConfigField }[] = [];
  const groups = new Map<string, Map<string, ConfigField>>();
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
        `${plugin}: \`${key}\` must be ${spec.type}, got ${describe(supplied)} — ${spec.description}`,
      );
      continue;
    }

    config[key] = supplied;
  }

  for (const [head, leaves] of groups) {
    if (!Object.hasOwn(given, head)) {
      const filled = fill(leaves);
      if (filled === undefined) continue;
      config[head] = filled;
      continue;
    }

    const givenHead = given[head];
    if (!isRecord(givenHead)) {
      problems.push(
        `${plugin}: \`${head}\` must be a mapping whose settings are ${[...leaves.keys()].map((leaf) => `\`${head}.${leaf}\``).join(", ")}, got ${describe(givenHead)}`,
      );
      continue;
    }

    const problemsInGroup = validateInto(plugin, head, leaves, givenHead, (filled) => {
      config[head] = filled;
    });
    problems.push(...problemsInGroup);
  }

  // An unknown key is almost always a typo in a field that matters, and
  // ignoring it means the setting silently never applied. A dotted schema
  // names its group's leaves, so a leaf somebody wrote and no leaf declared
  // is named the same way, with the path it was written at.
  for (const key of Object.keys(given)) {
    if (!own.some(({ key: ownKey }) => ownKey === key) && !groups.has(key)) {
      problems.push(`${plugin}: \`${key}\` is not a setting this plugin has`);
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config };
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
      if (!matches(spec.type, source)) {
        problems.push(`${plugin}: \`${where}\` must be ${spec.type}, got ${describe(source)} — ${spec.description}`);
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
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
