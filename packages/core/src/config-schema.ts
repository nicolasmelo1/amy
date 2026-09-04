export type ConfigFieldType = "string" | "number" | "boolean" | "string[]" | "record";

export interface ConfigField {
  readonly type: ConfigFieldType;
  /** What the field is for. Printed when the field is missing or wrong. */
  readonly description: string;
  readonly required?: boolean;
  readonly default?: unknown;
}

/**
 * What one plugin says its configuration looks like.
 *
 * Declared by the plugin rather than known by the host, because the host has
 * no business knowing that a tracker has a status name or that a notifier has
 * a channel. Kept to five types on purpose: a plugin that needs more shape
 * than this wants its own validation, not a bigger schema language here.
 */
export type ConfigSchema = Record<string, ConfigField>;

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

  for (const [field, spec] of Object.entries(schema)) {
    const present = Object.hasOwn(given, field);

    if (!present) {
      if (spec.required) {
        problems.push(`${plugin}: \`${field}\` is required — ${spec.description}`);
      } else if (spec.default !== undefined) {
        config[field] = spec.default;
      }
      continue;
    }

    const supplied = given[field];
    if (!matches(spec.type, supplied)) {
      problems.push(
        `${plugin}: \`${field}\` must be ${spec.type}, got ${describe(supplied)} — ${spec.description}`,
      );
      continue;
    }

    config[field] = supplied;
  }

  // An unknown key is almost always a typo in a field that matters, and
  // ignoring it means the setting silently never applied.
  for (const field of Object.keys(given)) {
    if (!Object.hasOwn(schema, field)) {
      problems.push(`${plugin}: \`${field}\` is not a setting this plugin has`);
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config };
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
