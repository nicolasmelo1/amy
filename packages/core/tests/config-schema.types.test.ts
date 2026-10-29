import { describe, expectTypeOf, it } from "vitest";
import { ConfigOf, ConfigSchema, definePlugin } from "../src/index.js";

const schema = {
  timeoutMs: { type: "number", default: 1_000, description: "how long one operation may take" },
  labels: { type: "string[]", required: true, description: "the labels an operation accepts" },
  optionalName: { type: "string", description: "an optional display name" },
  metadata: { type: "record", default: {}, description: "unstructured metadata the plugin narrows itself" },
} satisfies ConfigSchema;

const possiblyUndefinedTimeout: number | undefined = Math.random() > 0.5 ? 1_000 : undefined;

const _undefinedDefaults = {
  explicit: { type: "number", default: undefined, description: "an omitted numeric default" },
  possible: { type: "number", default: possiblyUndefinedTimeout, description: "a conditional numeric default" },
} satisfies ConfigSchema;

describe("a config is typed by its schema", () => {
  it("maps every schema field to the value the host validated", () => {
    expectTypeOf<ConfigOf<typeof schema>>().toEqualTypeOf<{
      timeoutMs: number;
      labels: string[];
      optionalName: string | undefined;
      metadata: Record<string, unknown>;
    }>();
  });

  it("keeps undefined defaults optional", () => {
    expectTypeOf<ConfigOf<typeof _undefinedDefaults>>().toEqualTypeOf<{
      explicit: number | undefined;
      possible: number | undefined;
    }>();
  });

  it("gives definePlugin the schema's exact configuration", () => {
    definePlugin({
      name: "typed-test-plugin",
      configSchema: schema,
      register(_, ctx) {
        expectTypeOf(ctx.config.timeoutMs).toEqualTypeOf<number>();
        expectTypeOf(ctx.config.labels).toEqualTypeOf<string[]>();
        expectTypeOf(ctx.config.optionalName).toEqualTypeOf<string | undefined>();

        // @ts-expect-error A number schema cannot be read as a string.
        const wrongType: string = ctx.config.timeoutMs;
        // @ts-expect-error An optional setting must be handled before use.
        const requiredName: string = ctx.config.optionalName;
        void wrongType;
        void requiredName;
      },
    });
  });

  it("refuses a default that the field type cannot hold", () => {
    const badDefault = {
      // @ts-expect-error A number setting cannot default to text.
      timeoutMs: {
        type: "number",
        default: "later",
        description: "how long one operation may take",
      },
    } satisfies ConfigSchema;

    void badDefault;
  });
});
