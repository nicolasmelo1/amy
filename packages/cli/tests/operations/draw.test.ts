import { afterEach, describe, expect, it } from "vitest";
import { gather } from "../../src/plugin-commands.js";
import { register } from "../../src/operations/commands.js";
import { draw } from "../../src/operations/draw.js";
import { CONFIG, WORK, demo, environment, loading, program, spoken } from "./support.js";

async function typed(...argv: string[]) {
  const gathered = await gather(CONFIG, [WORK], loading(demo()));
  const heard = spoken();
  const made = program().program;
  register(made, gathered.contributions, environment(heard.out));
  await made.parseAsync(["node", "amy", ...argv]);
  return { said: heard.said, errors: heard.errors, code: process.exitCode };
}

describe("an operation without --json", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("draws the same output as labelled fields, its array of objects as a table", async () => {
    const asJson = await typed("demo", "ada", "--also", "grace", "--times", "2", "--json");
    const drawn = await typed("demo", "ada", "--also", "grace", "--times", "2");
    expect(drawn.code).toBe(0);
    expect(JSON.parse(asJson.said.join("\n"))).toEqual({
      text: "hello ada",
      mood: "warm",
      heard: [{ who: "ada", times: 2 }, { who: "grace", times: 2 }],
    });
    expect(drawn.said).toEqual([
      "said  hello ada",
      "mood  warm",
      "heard by",
      "  who    times",
      "  ada    2",
      "  grace  2",
    ]);
  });

  it("draws a stream one event at a time, and a declared error as its message", async () => {
    expect((await typed("demo-ticks", "2")).said).toEqual(["tick  n  1", "tick  n  2"]);
    const refused = await typed("demo", "nobody");
    expect(refused.errors).toEqual(["there is nobody to greet"]);
    expect(refused.code).toBe(1);
  });

  it("draws from the output and its schema alone: labels from descriptions, enums coloured when it may", () => {
    const schema = {
      type: "object",
      properties: {
        state: { type: "string", enum: ["in-flight", "terminal"], description: "state" },
        trees: {
          type: "array",
          description: "trees",
          items: { $ref: "#/$defs/tree" },
        },
        empty: { type: "array", items: { type: "string" }, description: "removed" },
      },
      $defs: { tree: { type: "object", properties: { id: { type: "string", title: "work" }, clean: { type: "boolean" } } } },
    };
    const value = { state: "terminal", trees: [{ id: "A-1", clean: true }], empty: [] };
    expect(draw(value, schema, false)).toEqual(["state    terminal", "trees", "  work  clean", "  A-1   yes", "removed  (none)"]);
    expect(draw(value, schema, true)[0]).toBe("state    \u001b[33mterminal\u001b[0m");
  });
});
