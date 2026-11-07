/**
 * Standard Schema and Standard JSON Schema, copied as interfaces so the core
 * keeps no runtime dependency (https://standardschema.dev, MIT, from
 * `@standard-schema/spec`). Any library implementing both — Zod 4.2+,
 * ArkType 2.1.28+, Valibot through its adapter — can declare an operation.
 * The spec's namespaces are spelled here as flat names; the shapes are its own.
 */

/** The inferred types a Standard schema carries. */
interface StandardTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** What every Standard spec's `~standard` holds. */
interface StandardTypedProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly types?: StandardTypes<Input, Output> | undefined;
}

/** The base every Standard spec extends. */
export interface StandardTypedV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardTypedProps<Input, Output>;
}

export type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
export type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];

interface StandardPathSegment {
  readonly key: PropertyKey;
}

export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment> | undefined;
}

interface StandardSuccess<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

interface StandardFailure {
  readonly issues: ReadonlyArray<StandardIssue>;
}

export type StandardResult<Output> = StandardSuccess<Output> | StandardFailure;

interface StandardValidateOptions {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

interface StandardSchemaProps<Input = unknown, Output = Input> extends StandardTypedProps<Input, Output> {
  readonly validate: (value: unknown, options?: StandardValidateOptions | undefined) => StandardResult<Output> | Promise<StandardResult<Output>>;
}

/** A schema that validates an unknown value. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

/** Any string, with the targets the spec names still suggested. */
type StandardJSONSchemaTarget = "draft-2020-12" | "draft-07" | "openapi-3.0" | (string & Record<never, never>);

interface StandardJSONSchemaOptions {
  readonly target: StandardJSONSchemaTarget;
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

interface StandardJSONSchemaConverter {
  readonly input: (options: StandardJSONSchemaOptions) => Record<string, unknown>;
  readonly output: (options: StandardJSONSchemaOptions) => Record<string, unknown>;
}

interface StandardJSONSchemaProps<Input = unknown, Output = Input> extends StandardTypedProps<Input, Output> {
  readonly jsonSchema: StandardJSONSchemaConverter;
}

/** A schema that can say what it accepts and returns as JSON Schema. */
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardJSONSchemaProps<Input, Output>;
}

/** What an operation's input, output and events are declared with: both specs at once. */
export interface OperationSchema<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output> & StandardJSONSchemaProps<Input, Output>;
}
