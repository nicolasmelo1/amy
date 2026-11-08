import { afterEach, describe, expect, it } from "vitest";
import { defineOperation } from "@amykit/core";
import type { OperationSchema } from "@amykit/core";
import { gather } from "../../src/plugin-commands.js";
import { register } from "../../src/operations/commands.js";
import { CONFIG, WORK, demo, environment, loading, program, spoken } from "./support.js";

/** Runs `amy demo …` with --json, answering what it printed and its exit code. */
async function typed(...argv: string[]): Promise<{ output: unknown; errors: string[]; code: unknown }> {
  const gathered = await gather(CONFIG, [WORK], loading(demo()));
  const heard = spoken();
  const made = program().program;
  register(made, gathered.contributions, environment(heard.out));
  try {
    await made.parseAsync(["node", "amy", "demo", ...argv, "--json"]);
  } catch (error) {
    return { output: undefined, errors: [...heard.errors, (error as Error).message], code: (error as { exitCode?: number }).exitCode };
  }
  return { output: heard.said.length > 0 ? JSON.parse(heard.said.join("\n")) : undefined, errors: heard.errors, code: process.exitCode };
}

describe("an operation's input, from argv", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("parses a number, a bare boolean, a repeated array and an enum as their schemas say", async () => {
    const ran = await typed("ada", "--times", "3", "--loud", "--also", "grace", "--also", "alan", "--mood", "dry");
    expect(ran.code).toBe(0);
    expect(ran.output).toEqual({
      text: "HELLO ADA",
      mood: "dry",
      heard: [{ who: "ada", times: 3 }, { who: "grace", times: 3 }, { who: "alan", times: 3 }],
    });
  });

  it("refuses a value its field's type refuses with exit 2, naming the flag", async () => {
    const number = await typed("ada", "--times", "three");
    expect(number.code).toBe(2);
    expect(JSON.parse(number.errors[0]!)).toMatchObject({ code: "amy.input", message: "--times takes a number, and `three` is not one" });

    const whole = await typed("ada", "--times", "1.5");
    expect(whole.code).toBe(2);
    expect(JSON.parse(whole.errors[0]!).message).toContain("--times takes a whole number");

    const mood = await typed("ada", "--mood", "grumpy");
    expect(mood.code).toBe(2);
    expect(JSON.parse(mood.errors[0]!).message).toBe("--mood is one of warm, dry, and `grumpy` is not");
  });

  it("refuses an input the schema itself refuses with exit 2, naming the flag", async () => {
    const zero = await typed("ada", "--times", "0");
    expect(zero.code).toBe(2);
    const refused = JSON.parse(zero.errors[0]!);
    expect(refused.code).toBe("amy.input");
    expect(refused.message).toMatch(/^`amy demo` refused its input: --times: /);
  });

  it("refuses a flag nobody declared with exit 2", async () => {
    const unknown = await typed("ada", "--nonsense");
    expect(unknown.code).toBe(2);
    expect(unknown.errors.join("\n")).toContain("--nonsense");
  });

  it("lists an enum's values and a field's default in the help", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const made = program();
    register(made.program, gathered.contributions, environment(spoken().out));
    await expect(made.program.parseAsync(["node", "amy", "demo", "--help"])).rejects.toThrow();
    const help = made.help.join("").replace(/\s+/g, " ");
    expect(help).toContain("--mood <value> how it is said (one of: warm, dry; default: \"warm\")");
    expect(help).toContain("--also <value> who else (repeat it for more than one; default: [])");
    expect(help).toContain("--loud shout it");
    expect(help).toContain("--times <number> how many times");
  });

  it("parses an array whose items are a reference into the input's definitions as those items say", async () => {
    // A hand-written schema, so the reference is certain to be there: the
    // field is lifted out of the root, and its item points back into it.
    const counts: OperationSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value: unknown) => ({ value }),
        jsonSchema: {
          input: () => ({
            type: "object",
            properties: { counts: { type: "array", items: { $ref: "#/$defs/count" }, description: "counts" } },
            required: ["counts"],
            $defs: { count: { type: "integer" } },
          }),
          output: () => ({ type: "object" }),
        },
      },
    } as unknown as OperationSchema;
    const echo = defineOperation({
      id: "demo.echo",
      domain: "demo",
      summary: "Echo what it was given",
      description: "Answers its input. Changes nothing.",
      input: counts,
      output: counts,
      writes: [],
      http: { method: "post", path: "/demo/echo" },
      cli: { words: ["echo"] },
      examples: [{ summary: "two", input: { counts: [1, 2] }, output: { counts: [1, 2] } }],
      async handler(input) {
        return input;
      },
    });
    const gathered = await gather(CONFIG, [WORK], loading(demo({ operations: [echo] })));
    const heard = spoken();
    const made = program().program;
    register(made, gathered.contributions, environment(heard.out));
    await made.parseAsync(["node", "amy", "echo", "--counts", "3", "--counts", "4", "--json"]);
    expect(JSON.parse(heard.said.join("\n"))).toEqual({ counts: [3, 4] });

    const refused = spoken();
    const again = program().program;
    register(again, gathered.contributions, environment(refused.out));
    await again.parseAsync(["node", "amy", "echo", "--counts", "3.5", "--json"]);
    expect(process.exitCode).toBe(2);
    expect(JSON.parse(refused.errors[0]!).message).toBe("--counts takes a whole number, and `3.5` is not one");
  });

  it("says an argument commander refuses as the envelope under --json, once, with exit 2", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const heard = spoken();
    const made = program();
    register(made.program, gathered.contributions, environment(heard.out));
    await expect(made.program.parseAsync(["node", "amy", "demo-ticks", "--json"])).rejects.toMatchObject({ exitCode: 2, code: "amy.answered" });
    expect(heard.errors.map((line) => JSON.parse(line))).toEqual([{ code: "amy.input", message: "missing required argument 'to'" }]);
    expect(made.help.join("")).toBe("");
  });

  it("reads the fields of an input whose root is a reference into its own definitions", async () => {
    const heard = await echoing({
      $ref: "#/$defs/input",
      $defs: { input: { type: "object", properties: { size: { type: "integer", description: "size" } }, required: ["size"] } },
    }, ["--size", "3"]);
    expect(heard).toEqual({ size: 3 });
  });

  it("lets a boolean without a default be typed false as well as true", async () => {
    const schema = { type: "object", properties: { enabled: { type: "boolean", description: "on" } }, required: ["enabled"] };
    expect(await echoing(schema, ["--enabled"])).toEqual({ enabled: true });
    expect(await echoing(schema, ["--no-enabled"])).toEqual({ enabled: false });
  });

  it("registers and runs an operation whose array items refer to themselves, without looping", async () => {
    const tree = {
      type: "object",
      properties: { nodes: { type: "array", items: { $ref: "#/$defs/node" }, description: "nodes" } },
      $defs: { node: { type: "array", items: { $ref: "#/$defs/node" } } },
    };
    const answered = (await echoing(tree, ["--nodes", "a"])) as { nodes: unknown[] };
    expect(Array.isArray(answered.nodes)).toBe(true);
  });

  it("keeps every repeated value of an array flag, in order, however many there are", async () => {
    const schema = { type: "object", properties: { tag: { type: "array", items: { type: "string" }, description: "tags" } } };
    const typed = Array.from({ length: 20_000 }, (_, n) => ["--tag", `t${n}`]).flat();
    const answered = (await echoing(schema, typed)) as { tag: string[] };
    expect(answered.tag).toHaveLength(20_000);
    expect(answered.tag[19_999]).toBe("t19999");
  });
});

/** Runs an operation that answers its input, declared over a hand-written input schema. */
async function echoing(input: Record<string, unknown>, argv: readonly string[]): Promise<unknown> {
  const schema: OperationSchema = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => input, output: () => ({ type: "object" }) },
    },
  } as unknown as OperationSchema;
  const echo = defineOperation({
    id: "demo.echo",
    domain: "demo",
    summary: "Echo what it was given",
    description: "Answers its input. Changes nothing.",
    input: schema,
    output: schema,
    writes: [],
    http: { method: "post", path: "/demo/echo" },
    cli: { words: ["echo"] },
    examples: [{ summary: "anything", input: {}, output: {} }],
    async handler(given) {
      return given;
    },
  });
  const gathered = await gather(CONFIG, [WORK], loading(demo({ operations: [echo] })));
  const heard = spoken();
  const made = program().program;
  register(made, gathered.contributions, environment(heard.out));
  await made.parseAsync(["node", "amy", "echo", ...argv, "--json"]);
  return JSON.parse(heard.said.join("\n"));
}
