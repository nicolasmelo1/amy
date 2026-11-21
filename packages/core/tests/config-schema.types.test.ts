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

const escalation = {
  "escalation.scale.patient": { type: "number", required: true, description: "rounds a patient level allows" },
  "escalation.scale.normal": { type: "number", required: true, description: "rounds a normal level allows" },
  "escalation.scale.immediate": { type: "number", required: true, description: "rounds an immediate level allows" },
  "escalation.origins.gate.level": {
    type: "oneOf",
    group: "escalation.scale",
    required: true,
    description: "the level the gate's rounds are counted at",
  },
} as const satisfies ConfigSchema;

describe("a oneOf setting is typed by the group it names", () => {
  it("types the setting as the union of the group's keys", () => {
    // config-schema.ts:61 makes ValueFor read GroupKeys of the named group.
    expectTypeOf<ConfigOf<typeof escalation>["escalation"]["origins"]["gate"]["level"]>()
      .toEqualTypeOf<"patient" | "normal" | "immediate">();
    expectTypeOf<ConfigOf<typeof escalation>>().branded.toEqualTypeOf<{
      escalation: {
        scale: { patient: number; normal: number; immediate: number };
        origins: { gate: { level: "patient" | "normal" | "immediate" } };
      };
    }>();
  });

  it("refuses a value outside the union", () => {
    // @ts-expect-error `quickly` names no key of escalation.scale.
    const outside: ConfigOf<typeof escalation>["escalation"]["origins"]["gate"]["level"] = "quickly";
    void outside;
  });

  it("hands definePlugin the union, so a level is compared by the name it is", () => {
    definePlugin({
      name: "escalation-test-plugin",
      configSchema: escalation,
      register(_, ctx) {
        expectTypeOf(ctx.config.escalation.origins.gate.level)
          .toEqualTypeOf<"patient" | "normal" | "immediate">();
        expectTypeOf(ctx.config.escalation.scale.patient).toEqualTypeOf<number>();
      },
    });
  });
});

const optionalLevelSchema = {
  "escalation.scale.patient": { type: "number", required: true, description: "rounds a patient level allows" },
  "escalation.scale.normal": { type: "number", required: true, description: "rounds a normal level allows" },
  "escalation.origins.proof.level": {
    type: "oneOf",
    group: "escalation.scale",
    description: "the level the proof's rounds are counted at, when one is set",
  },
} as const satisfies ConfigSchema;
void optionalLevelSchema;

describe("a oneOf setting that is not required", () => {
  it("may be absent, like any other setting with no default", () => {
    expectTypeOf<ConfigOf<typeof optionalLevelSchema>["escalation"]["origins"]["proof"]["level"]>()
      .toEqualTypeOf<"patient" | "normal" | undefined>();
  });
});
