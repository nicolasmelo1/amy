import type { Operation, OperationSchema } from "@amykit/core";

/** A JSON Schema, as the library that declared the operation wrote it. */
export type Json = Record<string, unknown>;

const TARGET = { target: "draft-2020-12" } as const;

/** The schema of one side of an operation, straight from the library that declared it. */
export function jsonSchemaOf(schema: OperationSchema, side: "input" | "output"): Json {
  return schema["~standard"].jsonSchema[side](TARGET);
}

/** The input schema of an operation. */
export function inputSchemaOf(operation: Operation): Json {
  return jsonSchemaOf(operation.input, "input");
}

/**
 * A schema with its reference followed and its optional half dropped: what a
 * value of it actually looks like. `root` is where `#/$defs/...` resolves.
 */
export function resolved(schema: Json | undefined, root: Json | undefined): Json | undefined {
  let current = schema;
  for (let depth = 0; current && depth < 16; depth += 1) {
    const ref = current.$ref;
    if (typeof ref === "string" && ref.startsWith("#/$defs/") && root) {
      const defs = (root.$defs ?? {}) as Record<string, Json>;
      current = { ...defs[ref.slice("#/$defs/".length)], ...withoutKey(current, "$ref") };
      continue;
    }
    const branches = (current.anyOf ?? current.oneOf) as Json[] | undefined;
    if (Array.isArray(branches)) {
      const real = branches.filter((branch) => branch.type !== "null");
      if (real.length === 1) {
        current = { ...withoutKey(withoutKey(current, "anyOf"), "oneOf"), ...real[0] };
        continue;
      }
    }
    return current;
  }
  return current;
}

function withoutKey(schema: Json, key: string): Json {
  const { [key]: _dropped, ...rest } = schema;
  return rest;
}

/** The one type a schema names, `null` dropped from a list of them. */
export function typeOf(schema: Json | undefined): string | undefined {
  if (!schema) return undefined;
  if (Array.isArray(schema.enum)) return "enum";
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return (type as string[]).find((one) => one !== "null");
  if (schema.properties) return "object";
  return undefined;
}

/** What a person reads a field as: its title, its description, or its name. */
export function labelOf(name: string, schema: Json | undefined): string {
  if (typeof schema?.title === "string" && schema.title !== "") return schema.title;
  if (typeof schema?.description === "string" && schema.description !== "") return schema.description;
  return name;
}

/** `staleAfter` as a flag: `--stale-after`. */
export function flagOf(field: string): string {
  return `--${field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase()}`;
}
