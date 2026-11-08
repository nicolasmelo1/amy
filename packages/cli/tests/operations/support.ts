import { Command } from "commander";
import { z } from "zod";
import { defineOperation, fail, scopeOf } from "@amykit/core";
import type { Check, ConfigSchema, Plugin } from "@amykit/core";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { LoadResult } from "../../src/loader.js";
import type { CommandEnvironment } from "../../src/plugin-commands.js";
import type { Profile } from "../../src/profiles.js";

/**
 * A plugin this repository has never heard of, with an operation, a check and
 * a file: the shape the host has to carry without knowing what any of them
 * mean.
 */
const DEMO_SCHEMA = {
  greeting: { type: "string", description: "what the operation says", default: "hello" },
} satisfies ConfigSchema;

export const greet = defineOperation({
  id: "demo.greet",
  domain: "demo",
  summary: "Say what this plugin was configured to say",
  description: "Greets somebody with the configured greeting. Remembers nobody.",
  input: z.object({
    who: z.string().optional().describe("who to greet"),
    times: z.number().int().min(1).default(1).describe("how many times"),
    loud: z.boolean().default(false).describe("shout it"),
    also: z.array(z.string()).default([]).describe("who else"),
    mood: z.enum(["warm", "dry"]).default("warm").describe("how it is said"),
  }),
  output: z.object({
    text: z.string().describe("said"),
    mood: z.enum(["warm", "dry"]).describe("mood"),
    heard: z.array(z.object({ who: z.string().describe("who"), times: z.number().describe("times") })).describe("heard by"),
  }),
  errors: { "demo.nobody": { description: "the greeting was asked of nobody in particular" } },
  writes: [],
  http: { method: "post", path: "/demo/greetings" },
  cli: { words: ["demo"], positional: ["who"] },
  examples: [{
    summary: "one person",
    input: { who: "world" },
    output: { text: "hello world", mood: "warm", heard: [{ who: "world", times: 1 }] },
  }],
  async handler({ who, times, loud, also, mood }, context) {
    const { settings } = scopeOf<{ greeting: string }>(context, "demo.greet");
    if (who === "nobody") return fail("demo.nobody", "there is nobody to greet");
    const said = `${settings.greeting} ${who ?? "nobody"}`;
    return {
      text: loud ? said.toUpperCase() : said,
      mood,
      heard: [who ?? "nobody", ...also].map((one) => ({ who: one, times })),
    };
  },
});

const ticks = defineOperation({
  id: "demo.ticks",
  domain: "demo",
  summary: "Count up, one event at a time",
  description: "Yields one tick per number up to `to`, and fails at `failAt` when it is given.",
  input: z.object({ to: z.number().int().describe("how far"), failAt: z.number().int().optional().describe("where it breaks") }),
  events: { tick: z.object({ n: z.number().describe("n") }) },
  errors: { "demo.broke": { description: "the count broke where it was told to" } },
  writes: [],
  http: { method: "get", path: "/demo/ticks" },
  cli: { words: ["demo-ticks"], positional: ["to"] },
  examples: [{ summary: "two", input: { to: 2 }, output: [{ event: "tick", data: { n: 1 } }, { event: "tick", data: { n: 2 } }] }],
  async *handler({ to, failAt }) {
    for (let n = 1; n <= to; n += 1) {
      if (n === failAt) {
        yield fail("demo.broke", `broke at ${n}`);
        return;
      }
      yield { event: "tick" as const, data: { n } };
    }
  },
});

export function demo(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: "@acme/plugin-demo",
    configSchema: DEMO_SCHEMA,
    register() {},
    operations: [greet, ticks],
    checks: [
      {
        name: "demo check",
        run(): Check {
          return { label: "demo check", ok: false, detail: "everything is on fire" };
        },
      },
    ],
    files: [{ path: "demo.txt", content: () => "written once\n" }],
    ...overrides,
  };
}

export const WORK: Profile = {
  name: "work",
  workflow: "@acme/workflow-unheard-of",
  plugins: ["@acme/plugin-demo"],
  takesNotes: false,
  takesTasks: false,
  settings: {},
};

export const CONFIG = {
  ...DEFAULT_CONFIG,
  workflows: { work: { workflow: WORK.workflow, plugins: ["@acme/plugin-demo"] } },
  plugins: { "@acme/plugin-demo": { greeting: "hello" } },
};

/** What the loader would answer for a world where these modules import. */
export function loading(...plugins: readonly Plugin[]) {
  return async (specs: readonly string[]): Promise<LoadResult> => {
    const bySpec = new Map<string, Plugin>();
    for (const spec of specs) {
      const found = plugins.find((plugin) => plugin.name === spec);
      if (found) bySpec.set(spec, found);
    }
    return { plugins: [...bySpec.values()], problems: [], bySpec };
  };
}

export interface Spoken {
  readonly said: string[];
  readonly errors: string[];
  readonly out: { line(text?: string): void; error(text: string): void };
}

export function spoken(): Spoken {
  const said: string[] = [];
  const errors: string[] = [];
  return { said, errors, out: { line: (text = "") => said.push(text), error: (text: string) => errors.push(text) } };
}

export function environment(out: Spoken["out"], mounted = true, ports: ReadonlyMap<string, object> = new Map()): CommandEnvironment {
  return {
    home: "/amy",
    config: CONFIG,
    profileFor: () => ({ ok: true as const, profile: WORK }),
    mount: async () => mounted
      ? { ok: true as const, ports }
      : { ok: false as const, problems: ["@amykit/plugin-serial-engine: could not be imported"] },
    out,
  };
}

/** A program whose help and parse errors are captured rather than printed. */
export function program(): { program: Command; help: string[] } {
  const help: string[] = [];
  const made = new Command().name("amy").exitOverride().configureOutput({
    writeOut: (text) => help.push(text),
    writeErr: (text) => help.push(text),
  });
  return { program: made, help };
}
